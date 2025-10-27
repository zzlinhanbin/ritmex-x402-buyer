# Vercel 部署指南

本指南将帮助你将 ritmex-x402-buyer 项目部署到 Vercel。

## 项目概述

这是一个基于 x402 支付协议的测试工具，使用 Bun 运行时和 TypeScript 开发。项目已配置为在 Vercel 上作为无服务器函数运行。

## 部署前准备

### 1. 环境变量配置

在 Vercel 控制台中设置以下环境变量：

#### 必需的环境变量：
- `PRIVATE_KEY`: 你的 EVM 私钥（0x 前缀格式）
- `RESOURCE_SERVER_URL`: 资源服务器的基础 URL（例如：https://ritmex.one）

#### 可选的环境变量：
- `NETWORK`: EVM 网络（默认：base-sepolia）
- `ENDPOINT_PATH`: 端点路径（默认：/x402/test）
- `POLL_INTERVAL_MS`: 轮询间隔毫秒数（默认：2000）
- `REQUEST_COUNT`: 请求次数（默认：1）
- `HTTP_METHOD`: HTTP 方法（默认：GET）

### 2. 支持的网络

项目支持以下 EVM 网络：
- base-sepolia
- base
- avalanche-fuji
- avalanche
- iotex
- sei
- sei-testnet
- polygon
- polygon-amoy
- peaq

## 部署步骤

### 方法 1: 通过 Vercel CLI

1. 安装 Vercel CLI：
```bash
npm i -g vercel
```

2. 登录 Vercel：
```bash
vercel login
```

3. 在项目根目录运行：
```bash
vercel
```

4. 按照提示完成部署配置

### 方法 2: 通过 GitHub 集成

1. 将代码推送到 GitHub 仓库
2. 在 Vercel 控制台连接 GitHub 仓库
3. 配置环境变量
4. 部署项目

### 方法 3: 通过 Vercel 控制台

1. 访问 [Vercel 控制台](https://vercel.com/dashboard)
2. 点击 "New Project"
3. 导入你的 Git 仓库
4. 配置构建设置：
   - Framework Preset: Other
   - Build Command: `bun run build`
   - Output Directory: `dist`
   - Install Command: `bun install`
5. 设置环境变量
6. 点击 "Deploy"

## 项目结构

```
ritmex-x402-buyer/
├── api/
│   └── index.ts          # Vercel API 路由处理程序
├── vercel.json           # Vercel 配置文件
├── package.json          # 项目依赖和脚本
├── index.ts              # 原始 CLI 脚本
├── env.example           # 环境变量示例
└── VERCEL_DEPLOYMENT.md  # 本部署指南
```

## API 使用

部署成功后，你可以通过以下方式调用 API：

### GET 请求
```bash
curl https://your-project.vercel.app/api
```

### 响应格式
```json
{
  "success": true,
  "data": [
    {
      "iteration": 1,
      "total": 1,
      "targetUrl": "https://ritmex.one/x402/test",
      "status": 200,
      "responseBody": {...},
      "requirement": {...},
      "amountAtomic": "1000000",
      "amountFormatted": "1.0",
      "asset": "0x...",
      "assetSymbol": "USDC",
      "network": "base-sepolia",
      "balanceBefore": {...},
      "balanceAfter": {...},
      "durationMs": 1500
    }
  ],
  "message": "x402 payment test completed successfully"
}
```

## 安全注意事项

1. **私钥安全**: 永远不要将私钥提交到版本控制系统
2. **环境变量**: 在 Vercel 控制台中安全地设置敏感信息
3. **网络访问**: 确保你的私钥对应的钱包有足够的测试代币

## 故障排除

### 常见问题

1. **构建失败**
   - 检查 `package.json` 中的依赖版本
   - 确保所有必需的依赖都已安装

2. **运行时错误**
   - 验证环境变量是否正确设置
   - 检查网络连接和 RPC 端点

3. **支付失败**
   - 确保钱包有足够的代币余额
   - 验证网络配置是否正确

### 调试

查看 Vercel 函数日志：
1. 访问 Vercel 控制台
2. 选择你的项目
3. 进入 "Functions" 标签
4. 查看函数执行日志

## 本地开发

要在本地测试 Vercel 函数：

1. 安装依赖：
```bash
bun install
```

2. 设置环境变量：
```bash
cp env.example .env
# 编辑 .env 文件，填入你的配置
```

3. 运行开发服务器：
```bash
bun run dev
```

## 更新和维护

- 更新代码后，推送到 Git 仓库会自动触发重新部署
- 修改环境变量需要在 Vercel 控制台中更新
- 查看部署状态和日志在 Vercel 控制台的 "Deployments" 标签

## 支持

如果遇到问题，请检查：
1. Vercel 函数日志
2. 环境变量配置
3. 网络连接状态
4. 钱包余额和权限

更多信息请参考 [Vercel 文档](https://vercel.com/docs) 和 [x402 协议文档](https://github.com/ritmex/x402)。
