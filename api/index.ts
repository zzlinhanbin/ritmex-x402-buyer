import type { VercelRequest, VercelResponse } from '@vercel/node';
import chalk from "chalk";
import { config as loadEnv } from "dotenv";
import type { Address, Hex } from "viem";
import { erc20Abi, formatUnits, isAddress } from "viem";
import { createPaymentHeader, selectPaymentRequirements } from "x402/client";
import { decodeXPaymentResponse, createSigner } from "x402-fetch";
import {
  PaymentRequirementsSchema,
  createConnectedClient,
  isEvmSignerWallet,
  type ConnectedClient,
  type Network,
  type PaymentRequirements,
  type Signer,
} from "x402/types";

loadEnv();

interface AppConfig {
  privateKey: Hex | string;
  baseUrl: string;
  endpointPath: string;
  network: Network;
  pollIntervalMs: number;
  requestCount: number;
  method: string;
}

interface TokenMetadata {
  decimals: number;
  symbol?: string;
  name?: string;
}

interface BalanceInfo {
  raw: bigint;
  formatted: string;
  decimals: number;
  symbol?: string;
}

interface AggregatedSpend {
  raw: bigint;
  decimals?: number;
  symbol?: string;
}

interface RunResult {
  iteration: number;
  total: number;
  targetUrl: string;
  status: number;
  responseBody?: unknown;
  responseText?: string;
  requirement?: PaymentRequirements;
  amountAtomic?: bigint;
  amountFormatted?: string;
  amountDecimals?: number;
  asset?: string;
  assetSymbol?: string;
  network?: string;
  balanceBefore?: BalanceInfo;
  balanceAfter?: BalanceInfo;
  balanceDiff?: bigint;
  paymentResponseHeader?: string | null;
  decodedPayment?: ReturnType<typeof decodeXPaymentResponse>;
  durationMs: number;
  error?: Error;
}

interface RequestContext {
  iteration: number;
  total: number;
  url: string;
  method: string;
  network: Network;
  signer: Signer;
  walletAddress: Address;
  client: EvmClient;
}

const SUPPORTED_NETWORKS = [
  "base-sepolia",
  "base",
  "avalanche-fuji",
  "avalanche",
  "iotex",
  "sei",
  "sei-testnet",
  "polygon",
  "polygon-amoy",
  "peaq",
] as const satisfies readonly Network[];

type ReadContractArgs = {
  address: Address;
  abi: typeof erc20Abi;
  functionName: string;
  args?: readonly unknown[];
};

type EvmClient = ConnectedClient & {
  readContract: (args: ReadContractArgs) => Promise<unknown>;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-PAYMENT');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const appConfig = buildConfig();
    const result = await runX402Test(appConfig);
    
    res.status(200).json({
      success: true,
      data: result,
      message: "x402 payment test completed successfully"
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      message: "x402 payment test failed"
    });
  }
}

async function runX402Test(appConfig: AppConfig): Promise<RunResult[]> {
  const targetUrl = buildUrl(appConfig.baseUrl, appConfig.endpointPath);
  console.log(chalk.bold("▶ Initializing x402 buyer"));
  console.log(`${chalk.gray(" •")} ${chalk.white("Network")}: ${chalk.yellow(appConfig.network)}`);
  console.log(`${chalk.gray(" •")} ${chalk.white("Target")}: ${chalk.cyan(targetUrl)}`);
  console.log(`${chalk.gray(" •")} ${chalk.white("Method")}: ${appConfig.method}`);
  console.log(`${chalk.gray(" •")} ${chalk.white("Requests")}: ${appConfig.requestCount}`);
  console.log(`${chalk.gray(" •")} ${chalk.white("Interval")}: ${appConfig.pollIntervalMs} ms`);

  const signer = await createSigner(appConfig.network, appConfig.privateKey);
  const client = ensureEvmClient(createConnectedClient(appConfig.network));
  const walletAddress = await resolveWalletAddress(signer);
  console.log(`${chalk.gray(" •")} ${chalk.white("Wallet")}: ${chalk.green(walletAddress)}`);

  const results: RunResult[] = [];
  const spendTotals = new Map<string, AggregatedSpend>();

  for (let index = 0; index < appConfig.requestCount; index += 1) {
    const context: RequestContext = {
      iteration: index + 1,
      total: appConfig.requestCount,
      url: targetUrl,
      method: appConfig.method,
      network: appConfig.network,
      signer,
      walletAddress,
      client,
    };

    const result = await performPaidRequest(context);
    results.push(result);
    displayRunSummary(result);

    if (
      !result.error &&
      result.amountAtomic !== undefined &&
      result.asset &&
      result.network &&
      result.status >= 200 &&
      result.status < 300
    ) {
      const key = `${result.asset.toLowerCase()}@${result.network}`;
      const existing = spendTotals.get(key) ?? { raw: 0n };
      existing.raw += result.amountAtomic;
      if (result.amountDecimals !== undefined) {
        existing.decimals = result.amountDecimals;
      }
      if (result.assetSymbol) {
        existing.symbol = result.assetSymbol;
      }
      spendTotals.set(key, existing);
    }

    if (index < appConfig.requestCount - 1) {
      await sleep(appConfig.pollIntervalMs);
    }
  }

  if (spendTotals.size > 0) {
    console.log(chalk.bold("\n▶ Totals"));
    for (const [key, summary] of spendTotals.entries()) {
      const displayAmount =
        summary.decimals !== undefined
          ? formatUnits(summary.raw, summary.decimals)
          : summary.raw.toString();
      const symbol = summary.symbol ?? "units";
      console.log(
        `${chalk.gray(" •")} ${chalk.white(key)}: ${chalk.magenta(displayAmount)} ${symbol}`,
      );
    }
  }

  return results;
}

function buildConfig(): AppConfig {
  const privateKey = process.env.PRIVATE_KEY as Hex | string | undefined;
  const baseUrl = process.env.RESOURCE_SERVER_URL ?? "";
  const endpointPath = process.env.ENDPOINT_PATH ?? "/";
  const networkInput = process.env.NETWORK ?? "base-sepolia";
  const network = parseNetwork(networkInput);
  const pollIntervalMs = resolveNumber(process.env.POLL_INTERVAL_MS, 2000);
  const requestCount = resolveNumber(process.env.REQUEST_COUNT, 1);
  const method = (process.env.HTTP_METHOD ?? "GET").toUpperCase();

  const missing: string[] = [];
  if (!privateKey) missing.push("PRIVATE_KEY");
  if (!baseUrl) missing.push("RESOURCE_SERVER_URL");

  if (missing.length > 0) {
    throw new Error(`Missing required configuration: ${missing.join(", ")}`);
  }

  if (requestCount < 1) {
    throw new Error("REQUEST_COUNT must be at least 1");
  }

  const resolvedPrivateKey = privateKey as Hex | string;

  return {
    privateKey: resolvedPrivateKey,
    baseUrl,
    endpointPath,
    network,
    pollIntervalMs,
    requestCount,
    method,
  };
}

function resolveNumber(envValue: string | undefined, fallback: number): number {
  if (envValue !== undefined) {
    const numeric = Number(envValue);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }
  return fallback;
}

function parseNetwork(value: string): Network {
  const normalized = value.trim().toLowerCase();
  if ((SUPPORTED_NETWORKS as readonly string[]).includes(normalized)) {
    return normalized as Network;
  }
  const supported = SUPPORTED_NETWORKS.join(", ");
  throw new Error(`Unsupported network "${value}". Supported networks: ${supported}`);
}

function ensureEvmClient(client: ConnectedClient): EvmClient {
  if (typeof (client as { readContract?: unknown }).readContract === "function") {
    return client as EvmClient;
  }
  const supported = SUPPORTED_NETWORKS.join(", ");
  throw new Error(
    `Connected client does not expose readContract. Ensure you selected an EVM network (${supported}).`,
  );
}

function buildUrl(baseUrl: string, endpointPath: string): string {
  const trimmedBase = baseUrl.trim();

  if (/^https?:\/\//i.test(endpointPath)) {
    return endpointPath;
  }

  if (!/^https?:\/\//i.test(trimmedBase)) {
    throw new Error(`RESOURCE_SERVER_URL must include protocol (received: ${baseUrl})`);
  }

  const normalizedBase = trimmedBase.endsWith("/") ? trimmedBase : `${trimmedBase}/`;

  try {
    const url = new URL(endpointPath, normalizedBase);
    return url.toString();
  } catch (error) {
    throw new Error(`Unable to construct request URL: ${(error as Error).message}`);
  }
}

async function resolveWalletAddress(signer: Signer): Promise<Address> {
  if (!isEvmSignerWallet(signer)) {
    throw new Error("Current script only supports EVM signers for balance introspection.");
  }

  if (hasGetAddresses(signer)) {
    const addresses = await signer.getAddresses();
    if (addresses.length > 0) {
      return addresses[0] as Address;
    }
  }

  if (hasAccount(signer)) {
    return signer.account.address as Address;
  }

  if (hasAddress(signer)) {
    return signer.address as Address;
  }

  throw new Error("Unable to determine wallet address from signer");
}

async function performPaidRequest(context: RequestContext): Promise<RunResult> {
  const startedAt = Date.now();
  try {
    const initialResponse = await fetch(context.url, { method: context.method });

    if (initialResponse.status !== 402) {
      const { body, text } = await parseResponseBody(initialResponse);
      return {
        iteration: context.iteration,
        total: context.total,
        targetUrl: context.url,
        status: initialResponse.status,
        responseBody: body,
        responseText: text,
        durationMs: Date.now() - startedAt,
      };
    }

    const challenge = await initialResponse.json();
    const { x402Version, accepts } = challenge as {
      x402Version: number;
      accepts: unknown[];
    };

    if (!Array.isArray(accepts)) {
      throw new Error("Invalid 402 response: missing accepts array");
    }

    const parsedRequirements = accepts.map(entry => PaymentRequirementsSchema.parse(entry));
    const selectedRequirement = selectPaymentRequirements(parsedRequirements, context.network, "exact");

    const amountAtomic = BigInt(selectedRequirement.maxAmountRequired);
    const amountDecimals = inferDecimals(selectedRequirement);
    let tokenMetadata: TokenMetadata | undefined;
    let balanceBefore: BalanceInfo | undefined;
    let balanceAfter: BalanceInfo | undefined;
    let assetSymbol = inferSymbol(selectedRequirement);

    if (isAddress(selectedRequirement.asset)) {
      tokenMetadata = await getErc20Metadata(context.client, selectedRequirement.asset as Address);
      const decimals = tokenMetadata?.decimals ?? amountDecimals;
      const symbol = tokenMetadata?.symbol ?? assetSymbol;
      balanceBefore = await getErc20Balance(
        context.client,
        selectedRequirement.asset as Address,
        context.walletAddress,
        decimals,
        symbol,
      );
      assetSymbol = symbol;
    }

    const paymentHeader = await createPaymentHeader(context.signer, x402Version, selectedRequirement);

    const paidResponse = await fetch(context.url, {
      method: context.method,
      headers: {
        "X-PAYMENT": paymentHeader,
        "Access-Control-Expose-Headers": "X-PAYMENT-RESPONSE",
      },
    });

    const { body, text } = await parseResponseBody(paidResponse);

    if (isAddress(selectedRequirement.asset)) {
      const decimals = tokenMetadata?.decimals ?? amountDecimals;
      const symbol = tokenMetadata?.symbol ?? assetSymbol;
      balanceAfter = await getErc20Balance(
        context.client,
        selectedRequirement.asset as Address,
        context.walletAddress,
        decimals,
        symbol,
      );
      assetSymbol = symbol;
    }

    const paymentResponseHeader = paidResponse.headers.get("x-payment-response");
    const decodedPayment = paymentResponseHeader ? decodeXPaymentResponse(paymentResponseHeader) : undefined;
    const balanceDiff = balanceBefore && balanceAfter ? balanceBefore.raw - balanceAfter.raw : undefined;

    return {
      iteration: context.iteration,
      total: context.total,
      targetUrl: context.url,
      status: paidResponse.status,
      responseBody: body,
      responseText: text,
      requirement: selectedRequirement,
      amountAtomic,
      amountFormatted: formatUnits(amountAtomic, tokenMetadata?.decimals ?? amountDecimals),
      amountDecimals: tokenMetadata?.decimals ?? amountDecimals,
      asset: selectedRequirement.asset,
      assetSymbol,
      network: selectedRequirement.network,
      balanceBefore,
      balanceAfter,
      balanceDiff,
      paymentResponseHeader,
      decodedPayment,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      iteration: context.iteration,
      total: context.total,
      targetUrl: context.url,
      status: 0,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

async function getErc20Metadata(client: EvmClient, asset: Address): Promise<TokenMetadata | undefined> {
  const cacheKey = asset.toLowerCase();
  if (metadataCache.has(cacheKey)) {
    return metadataCache.get(cacheKey);
  }

  const [decimalsRaw, symbolRaw, nameRaw] = await Promise.all([
    client.readContract({ address: asset, abi: erc20Abi, functionName: "decimals" }).catch(() => undefined),
    client.readContract({ address: asset, abi: erc20Abi, functionName: "symbol" }).catch(() => undefined),
    client.readContract({ address: asset, abi: erc20Abi, functionName: "name" }).catch(() => undefined),
  ]);

  const decimals = typeof decimalsRaw === "number" ? decimalsRaw : typeof decimalsRaw === "bigint" ? Number(decimalsRaw) : undefined;
  const metadata: TokenMetadata = {
    decimals: decimals ?? 6,
    symbol: typeof symbolRaw === "string" ? symbolRaw : undefined,
    name: typeof nameRaw === "string" ? nameRaw : undefined,
  };

  metadataCache.set(cacheKey, metadata);
  return metadata;
}

async function getErc20Balance(
  client: EvmClient,
  asset: Address,
  owner: Address,
  decimals: number,
  symbol?: string,
): Promise<BalanceInfo | undefined> {
  try {
    const raw = (await client.readContract({
      address: asset,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [owner],
    })) as bigint;

    return {
      raw,
      formatted: formatUnits(raw, decimals),
      decimals,
      symbol,
    };
  } catch (error) {
    console.warn(
      `Unable to fetch token balance for ${asset}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
}

function inferDecimals(requirement: PaymentRequirements, fallback = 6): number {
  const candidates = [
    (requirement.extra as { decimals?: number | string } | undefined)?.decimals,
    (requirement.extra as { tokenDecimals?: number | string } | undefined)?.tokenDecimals,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
    if (typeof candidate === "string") {
      const numeric = Number(candidate);
      if (Number.isFinite(numeric)) {
        return numeric;
      }
    }
  }

  if (requirement.asset.toLowerCase().includes("usdc")) {
    return 6;
  }

  return fallback;
}

function inferSymbol(requirement: PaymentRequirements): string | undefined {
  const extra = requirement.extra as Record<string, unknown> | undefined;
  const candidates = [extra?.symbol, extra?.ticker, extra?.code, extra?.name];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }
  return undefined;
}

function parseResponseBody(response: Response): Promise<{ body?: unknown; text: string }> {
  return response
    .text()
    .then(text => {
      if (!text) {
        return { body: undefined, text: "" };
      }
      try {
        return { body: JSON.parse(text), text };
      } catch {
        return { body: text, text };
      }
    })
    .catch(() => ({ body: undefined, text: "" }));
}

function displayRunSummary(result: RunResult): void {
  const statusColour =
    result.status >= 200 && result.status < 300
      ? chalk.green
      : result.status === 0
        ? chalk.red
        : chalk.yellow;

  console.log(chalk.bold(`\n▶ Request ${result.iteration}/${result.total}`));
  console.log(`${chalk.gray(" •")} ${chalk.white("URL")}: ${chalk.cyan(result.targetUrl)}`);
  console.log(`${chalk.gray(" •")} ${chalk.white("Status")}: ${statusColour(result.status || "error")}`);

  if (result.requirement) {
    console.log(`${chalk.gray(" •")} ${chalk.white("Network")}: ${chalk.yellow(result.network ?? "unknown")}`);
    console.log(`${chalk.gray(" •")} ${chalk.white("Asset")}: ${result.asset ?? "unknown"}`);
    if (result.amountFormatted) {
      const symbol = result.assetSymbol ? ` ${result.assetSymbol}` : "";
      console.log(
        `${chalk.gray(" •")} ${chalk.white("Required")}: ${chalk.magenta(result.amountFormatted)}${symbol} (${result.amountAtomic?.toString()} atomic)`,
      );
    } else if (result.amountAtomic !== undefined) {
      console.log(`${chalk.gray(" •")} ${chalk.white("Required")}: ${result.amountAtomic.toString()} atomic units`);
    }
  }

  if (result.balanceBefore) {
    console.log(
      `${chalk.gray(" •")} ${chalk.white("Balance (before)")}: ${chalk.blue(result.balanceBefore.formatted)}${result.balanceBefore.symbol ? ` ${result.balanceBefore.symbol}` : ""}`,
    );
  }

  if (result.balanceAfter) {
    console.log(
      `${chalk.gray(" •")} ${chalk.white("Balance (after)")}: ${chalk.blue(result.balanceAfter.formatted)}${result.balanceAfter.symbol ? ` ${result.balanceAfter.symbol}` : ""}`,
    );
  }

  if (result.balanceDiff !== undefined) {
    const diff = result.balanceDiff;
    const decimals = result.amountDecimals ?? result.balanceBefore?.decimals;
    const formattedDiff = decimals !== undefined ? formatUnits(diff < 0n ? -diff : diff, decimals) : diff.toString();
    const prefix = diff >= 0n ? "-" : "+";
    console.log(
      `${chalk.gray(" •")} ${chalk.white("Balance Change")}: ${prefix}${formattedDiff}${result.assetSymbol ? ` ${result.assetSymbol}` : ""}`,
    );
  }

  if (result.decodedPayment) {
    const transaction = truncate(result.decodedPayment.transaction);
    console.log(
      `${chalk.gray(" •")} ${chalk.white("Payment Tx")}: ${transaction} (${result.decodedPayment.network})`,
    );
  }

  if (result.responseBody !== undefined) {
    console.log(`${chalk.gray(" •")} ${chalk.white("Response")}:`);
    console.log(indent(formatForDisplay(result.responseBody), 4));
  }

  if (result.error) {
    console.error(`${chalk.gray(" •")} ${chalk.red("Error")}: ${result.error.message}`);
  }

  console.log(`${chalk.gray(" •")} ${chalk.white("Duration")}: ${result.durationMs} ms`);
}

function formatForDisplay(body: unknown): string {
  if (body === undefined) return "<empty>";
  if (body === null) return "null";
  if (typeof body === "string") {
    return body.length > 500 ? `${body.slice(0, 500)}…` : body;
  }
  try {
    return JSON.stringify(body, null, 2);
  } catch (error) {
    return String(error);
  }
}

function indent(text: string, spaces: number): string {
  const padding = " ".repeat(spaces);
  return text
    .split("\n")
    .map(line => `${padding}${line}`)
    .join("\n");
}

function truncate(value: string, length = 18): string {
  if (value.length <= length) {
    return value;
  }
  return `${value.slice(0, length - 1)}…`;
}

const metadataCache = new Map<string, TokenMetadata>();

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

function hasGetAddresses(value: unknown): value is { getAddresses: () => Promise<readonly string[]> } {
  return typeof value === "object" && value !== null && typeof (value as { getAddresses?: unknown }).getAddresses === "function";
}

function hasAccount(value: unknown): value is { account: { address: string } } {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const account = (value as { account?: { address?: unknown } }).account;
  return typeof account === "object" && account !== null && typeof account.address === "string";
}

function hasAddress(value: unknown): value is { address: string } {
  return typeof value === "object" && value !== null && typeof (value as { address?: unknown }).address === "string";
}
