# ritmex-x402-buyer

Automated buyer script for x402 paywalled resources. The tool discovers payment requirements, prepares the payment header, submits the paid request, and prints a readable summary of costs, balances, and responses.

**看不懂英文？** 前往 [中文文档](README_cn.md).

## Prerequisites

- [Bun](https://bun.com) v1.2 or later
- Access to an x402-enabled resource server
- An EVM private key funded with the token accepted by the resource

Install dependencies once:

```bash
bun install
```

## Configure Environment Variables

1. Copy the sample file and fill in your values:

   ```bash
   cp env.example .env
   ```

2. Update the placeholders inside `.env`:

   - `PRIVATE_KEY`: 0x-prefixed EVM private key (store securely)
   - `NETWORK`: Supported EVM network, e.g. `base-sepolia`, `base`, `polygon`
   - `RESOURCE_SERVER_URL`: Base URL of the paid server, including protocol
   - `ENDPOINT_PATH`: Relative path or absolute URL of the paid endpoint
   - Optional tunables:
     - `POLL_INTERVAL_MS`: Delay between paid requests (milliseconds)
     - `REQUEST_COUNT`: Number of paid requests to run per session
     - `HTTP_METHOD`: HTTP verb (default `GET`)

Environment variables act as defaults and can be overridden by CLI flags at runtime.

## Run the Buyer

```bash
bun run index.ts [options]
```

Common flag overrides:

| Flag | Description |
| --- | --- |
| `--base-url <url>` | Override `RESOURCE_SERVER_URL` |
| `--path <path>` | Override `ENDPOINT_PATH` (accepts absolute URL) |
| `--network <network>` | Override `NETWORK` |
| `--count <n>` | Number of paid requests to send |
| `--interval <ms>` | Delay between requests in milliseconds |
| `--method <verb>` | HTTP method (e.g. `POST`) |

Example session:

```bash
bun run index.ts \
  --base-url https://api.example.com \
  --path /paid-endpoint \
  --network base-sepolia \
  --count 3 \
  --interval 1500
```

The script outputs for each iteration:

- Selected payment requirement (network, asset, atomic amount)
- Wallet balance before/after and net spend
- Decoded payment transaction hash and response body
- Aggregated totals across the entire run

## Troubleshooting

- **Missing configuration**: Ensure `.env` exists or pass the relevant CLI flags.
- **Unsupported network**: `NETWORK` must be one of the supported EVM networks (`base`, `base-sepolia`, `polygon`, etc.).
- **Balance fetch warnings**: The script reads ERC20 balances. Confirm the resource accepts an ERC20 asset on the selected network and that your RPC access is healthy.

Use `bun x tsc --noEmit` to lint types if you modify the script.
