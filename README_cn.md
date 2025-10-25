# ritmex-x402-buyer 使用指南

该脚本用于自动访问启用了 x402 支付协议的接口：根据服务端返回的 `402 Payment Required` 挑战自动准备支付报文、再次请求资源，并输出每次请求的花费、余额变化和响应内容。

## 环境要求

- Bun ≥ 1.2
- 可访问的 x402 资源服务端
- 拥有足够余额的 EVM 私钥（需持有目标资产）

首次安装依赖：

```bash
bun install
```

## 配置环境变量

1. 复制示例配置：

   ```bash
   cp env.example .env
   ```

2. 修改 `.env` 中的变量：

   - `PRIVATE_KEY`：带 `0x` 前缀的 EVM 私钥，请妥善保管
   - `NETWORK`：目标网络，例如 `base-sepolia`、`base`、`polygon`
   - `RESOURCE_SERVER_URL`：资源服务端基础 URL，需包含协议
   - `ENDPOINT_PATH`：付费接口的路径或完整 URL
   - 可选参数：
     - `POLL_INTERVAL_MS`：多次请求之间的等待毫秒数
     - `REQUEST_COUNT`：一次执行内的付费请求次数
     - `HTTP_METHOD`：HTTP 方法，默认 `GET`

环境变量作为默认值，运行时可通过命令行参数覆盖。

## 运行脚本

```bash
bun run index.ts [选项]
```

常用参数：

| 参数 | 说明 |
| --- | --- |
| `--base-url <url>` | 覆盖 `RESOURCE_SERVER_URL` |
| `--path <path>` | 覆盖 `ENDPOINT_PATH`（支持完整 URL） |
| `--network <network>` | 覆盖 `NETWORK` |
| `--count <n>` | 本次执行的请求次数 |
| `--interval <ms>` | 相邻请求的间隔毫秒数 |
| `--method <verb>` | HTTP 方法，如 `POST` |

示例：

```bash
bun run index.ts \
  --base-url https://api.example.com \
  --path /paid-endpoint \
  --network base-sepolia \
  --count 3 \
  --interval 1500
```

输出内容包括：

- 选中的支付方案（网络、资产地址、原子金额）
- 请求前后钱包余额及本次消耗
- 解码后的支付交易哈希与接口返回内容
- 整个会话的累计花费

## 常见问题

- **缺少配置**：确认 `.env` 已填写，或在运行时提供对应参数。
- **不支持的网络**：目前仅支持 EVM 网络（如 `base`、`base-sepolia`、`polygon` 等）。
- **余额读取警告**：脚本会读取 ERC20 余额，请确认付费资产为 ERC20 且 RPC 服务可用。

若改动脚本，建议运行 `bun x tsc --noEmit` 检查类型。
