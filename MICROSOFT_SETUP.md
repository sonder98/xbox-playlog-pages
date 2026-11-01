# Microsoft Xbox 官方数据授权与恢复

> 本项目 **已经完成真实 Microsoft Xbox 账号联调与正式同步**。这是授权恢复说明，而不是首次联调计划。多数日常维护不需要重新登录、提交令牌或更换应用。

## 工作方式

`Sync Xbox records`（`.github/workflows/sync.yml`）每半小时从 GitHub Actions 加密缓存恢复 Microsoft OAuth 凭据，自动续期并读取当前授权 Xbox 账号的数据。微软授权状态由 `MICROSOFT_STATE_KEY` 保护，站点快照由单独的 `APP_PASSWORD` 保护；公开仓库中只有加密快照和公开素材缓存。

手动授权/修复入口为 [Microsoft shadow sync](https://github.com/sonder98/xbox-playlog-pages/actions/workflows/microsoft-shadow.yml)，支持 `full`、`compare`、`repair` 和 `reauthorize`。它不会直接把候选结果上线。

## 只有在授权缓存失效时才操作

1. 打开 Actions → **Microsoft shadow sync** → **Run workflow**，选择 `main` 分支。
2. 如需重新授权，保留正确的微软应用 Client ID，选择 `reauthorize=true`。GitHub Actions 输出会给出微软官方验证网址和一次性验证码；在微软官方网站完成设备登录。
3. 凭据在 Actions 私有缓存中加密保存。首次授权或者账号切换后检查日志中有无账号身份不匹配的错误。
4. 手动授权成功后再观察正常 `Sync Xbox records`、`Deploy Playlog` 是否成功。无需把真实 token、账号 XUID、密码或 `auth.json` 发送到聊天。

如果原加密授权缓存已丢失，需要先检查 GitHub Secrets 中的 `MICROSOFT_STATE_KEY` 是否仍是原值。**不要随意更换它**，否则原缓存无法解密。是否需要重新授权应由实际错误日志判断，而不是见到同步变慢就重新授权。

## GitHub Secrets（只列变量名，不应披露值）

| 名称 | 作用 |
| --- | --- |
| `APP_PASSWORD` | 加密站点游戏档案，既有快照解锁所必需 |
| `MICROSOFT_STATE_KEY` | 加密微软授权和候选快照，格式须符合脚本校验 |
| `NEW_APP_PASSWORD` | 临时轮换站点密码时使用，平时可以没有 |
| `XBOX_CLIENT_ID` | 初始化或强制重新授权时使用，正常续期优先读加密缓存 |
| `XBOX_REFRESH_TOKEN` | 兼容初次初始化的可选变量，正常运行不要求每次提供 |
| `XBOX_CLIENT_SECRET` | 仅相关应用注册方式需要；正常公共客户端流程无此要求 |

不需要 `OPENXBL_API_KEY`，也不需要 Exophase 凭据。不能向 `public/vault.json`、源码、issue/PR、构建日志写入明文令牌。

## 开发与安全

本项目使用微软官方 OAuth 用户授权、Xbox 用户 Token 和 XSTS。对应适配器为 `scripts/microsoft.ts`，认证缓存管理为 `scripts/microsoft-credentials.ts`、`scripts/microsoft-state.ts`。

- 不要为排错在本机运行带真实用户令牌的全量同步；先使用 `npm test`、`npm run build` 及脱敏日志。
- 429 表示限流，需终止并保留上一版数据；不要自动高并发重试。
- 用户侧“记住设备”是前端解锁能力，与微软授权缓存相互独立。
- 更换站点密码遵循 `README.md` 的先验证新密码、再撤除旧密码流程。

参考：<https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow>。
