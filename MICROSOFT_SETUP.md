# 微软直连：首次授权

代码已支持微软 OAuth → Xbox 用户令牌 → XSTS → 本人游戏历史和统计。无需 OpenXBL。**尚未通过用户的真实微软账号完成联调；应用注册、权限或微软接口策略仍可能阻止访问。**

## 1. 注册自己的微软应用

使用有 Microsoft Entra 应用注册权限的账号登录 https://portal.azure.com/ ，进入 App registrations / 应用注册 → New registration / 新注册。

- 名称：游迹 Xbox 私人记录
- 支持的账号类型：Personal Microsoft accounts only / 仅个人 Microsoft 账户
- 注册后复制 Application (client) ID / 应用程序（客户端）ID。
- Authentication / 身份验证 → Add a platform / 添加平台 → Mobile and desktop applications / 移动和桌面应用。
- 添加系统浏览器回调：`http://localhost`。
- 在高级设置中启用 Allow public client flows / 允许公共客户端流，然后保存。
- 本方案使用原生公共客户端和 PKCE，不需要创建 client secret，也不要把回调配置成 SPA。

如果账号无法进入应用注册或没有创建权限，请把无敏感信息的错误截图反馈给开发者；先不要为此购买 Azure 服务。注册应用成功也不代表 Xbox 数据访问必然获得许可，需要真实授权验证。

## 2. 在自己的电脑完成首次微软授权

本步骤应在你自己的电脑执行，不是在 GitHub Actions 中执行。需要 Node.js 22.13 或更高版本。

下载本仓库源码并解压，或克隆本仓库。在仓库目录打开终端运行：

```sh
node scripts/microsoft-authorize.mjs
```

此助手无第三方依赖，不需要先运行 npm install。按提示输入刚注册的 Client ID。程序会在本机 127.0.0.1 启动临时回调，并打开微软官方登录页面。密码和验证码只在微软页面输入。

登录并同意访问自己的 Xbox 数据后，微软会跳回本机页面。该页面提供复制刷新令牌按钮；令牌不会输出到终端，不会写入文件，不会发送给 GitHub Pages 网站。不要发送到聊天、截图或源码。

## 3. 保存 GitHub Secrets

在 https://github.com/sonder98/xbox-playlog-pages/settings/secrets/actions 添加或保留：

| Name | 值 |
| --- | --- |
| `APP_PASSWORD` | 至少16位强应用密码，用于加密记录，保持不变以解密历史 |
| `XBOX_CLIENT_ID` | 自己注册的 Application (client) ID |
| `XBOX_REFRESH_TOKEN` | 本机授权页面复制的刷新令牌 |

`OPENXBL_API_KEY` 不再必需。配置微软直连后会优先使用它，不在授权失败时偷偷切换数据来源。

然后运行 Publish and sync Playlog，勾选同步。任务成功后刷新 GitHub Pages，使用 APP_PASSWORD 解密数据。

## 凭据边界

- 刷新令牌具有本人授权范围内的访问能力，只存 GitHub Secrets，不放公开密文文件。
- Actions 每次使用它取得短期访问令牌；访问令牌只在任务内存中使用，不写入公开文件或日志。
- 当前不会自动轮换 GitHub Secret。微软令牌过期或撤销后需要重新执行本机授权，更新 XBOX_REFRESH_TOKEN。
- 微软允许旧刷新令牌在换新后继续使用，但它仍会到期或被撤销；不能把本方案当作永久授权。
- 用户密码、验证码、浏览器登录 Cookie 均不由同步脚本读取。

## 参考

- https://learn.microsoft.com/en-us/gaming/gdk/docs/services/fundamentals/s2s-auth-calls/service-authentication/live-website-authentication
- https://learn.microsoft.com/en-us/entra/identity-platform/scenario-desktop-app-registration
- https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
- https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens
- 游戏历史与统计接口适配同时参考 OpenXbox/xbox-webapi-python 的 provider 实现。
