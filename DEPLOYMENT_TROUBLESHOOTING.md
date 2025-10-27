# Vercel 部署故障排除指南

## 问题：部署后出现 "Not Found" 错误

### 可能的原因和解决方案

#### 1. 检查部署状态
- 访问 Vercel 控制台查看部署日志
- 确保构建成功完成
- 检查是否有构建错误

#### 2. 测试基本 API 功能
首先测试简单的 API 端点：
```
https://your-project.vercel.app/api/test
```

如果这个端点工作，说明 Vercel 配置正确。

#### 3. 检查环境变量
确保在 Vercel 控制台中设置了必需的环境变量：
- `PRIVATE_KEY`
- `RESOURCE_SERVER_URL`

#### 4. 检查文件结构
确保项目结构正确：
```
ritmex-x402-buyer/
├── api/
│   ├── index.ts    # 主 API 处理程序
│   └── test.ts     # 测试 API
├── vercel.json     # Vercel 配置
└── package.json    # 项目依赖
```

#### 5. 重新部署
如果修改了配置，需要重新部署：
```bash
vercel --prod
```

### 调试步骤

1. **测试测试端点**：
   ```bash
   curl https://your-project.vercel.app/api/test
   ```
   应该返回：
   ```json
   {
     "success": true,
     "message": "API is working!",
     "timestamp": "2024-01-01T00:00:00.000Z",
     "method": "GET",
     "url": "/api/test"
   }
   ```

2. **测试主端点**：
   ```bash
   curl https://your-project.vercel.app/api
   ```
   或者：
   ```bash
   curl https://your-project.vercel.app/
   ```

3. **检查 Vercel 函数日志**：
   - 在 Vercel 控制台查看 "Functions" 标签
   - 查看执行日志和错误信息

### 常见错误和解决方案

#### 错误：Module not found
**解决方案**：确保所有依赖都在 `package.json` 中正确声明

#### 错误：Environment variable not found
**解决方案**：在 Vercel 控制台的 "Environment Variables" 中设置所有必需的环境变量

#### 错误：Function timeout
**解决方案**：x402 支付可能需要较长时间，考虑增加超时设置

#### 错误：CORS issues
**解决方案**：API 已经配置了 CORS 头，如果仍有问题，检查请求头

### 快速修复检查清单

- [ ] 项目已推送到 Git 仓库
- [ ] Vercel 项目已连接 Git 仓库
- [ ] 环境变量已设置
- [ ] 构建成功完成
- [ ] 测试端点 `/api/test` 工作正常
- [ ] 主端点 `/api` 或 `/` 工作正常

### 如果问题仍然存在

1. 检查 Vercel 函数日志中的具体错误信息
2. 尝试访问测试端点确认基本功能
3. 验证环境变量是否正确设置
4. 检查网络连接和 RPC 端点状态

### 联系支持

如果问题仍然存在，请提供：
- Vercel 函数日志
- 具体的错误消息
- 环境变量配置（隐藏敏感信息）
- 测试端点的响应
