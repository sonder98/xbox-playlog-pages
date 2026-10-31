# 微软直连验证（独立于线上 Exophase 同步）

验证任务：GitHub Actions → **Verify direct Microsoft Xbox access**。

先使用自己注册的微软应用完成授权。应用注册与用户授权成功不等于 Xbox 各接口均可访问，最终以验证报告为准。

## 无需在电脑安装程序的验证方式

1. 在 Microsoft Entra 的应用注册中注册自己的应用，例如 `Playlog`，支持账号选 **仅个人 Microsoft 帐户**。记录 **Application (client) ID**；这不是密码。
2. 在该应用的 Authentication / 身份验证中开启 **Allow public client flows / 允许公共客户端流**，用于设备代码授权。无需添加 Graph 权限，无需购买 Azure 计算资源或创建 client secret。
3. 打开验证工作流，点击 **Run workflow**，在 `client_id` 填自己的应用 ID。打开正在运行的 `verify` 任务中的授权步骤日志。
4. 日志会给出一个短期用户代码。在自己浏览器打开 `https://microsoft.com/devicelogin`，输入代码；核对应用确为自己注册的应用，选择要验证的 Xbox 账号并授权。
5. 任务自动继续，最多等待授权 10 分钟。工作流不会保存令牌、修改 GitHub Secrets 或切换线上同步；授权到的账号用于本次自查，不代表已配置长期自动同步。

设备登录流程是否允许 Xbox scopes、应用是否有权访问所需服务，都要通过真实调用验证。若微软拒绝设备流程，可在自己的电脑使用仓库已有的 `scripts/microsoft-authorize.mjs`，通过原生应用 `http://localhost` 回调与 PKCE 授权，再将刷新令牌直接保存在 GitHub Secret `XBOX_REFRESH_TOKEN`，应用 ID 保存在 `XBOX_CLIENT_ID`。不要发送令牌或微软密码到聊天。

已有这两个 Secrets 时，手动任务可不填输入，直接执行已授权验证。工作流只有仓库只读权限，不把新令牌写回 Secrets；续期检查仅验证同一任务内的一次刷新，长期续期与安全持久化仍是正式迁移前的独立工作。

## 验证内容

- 微软刷新令牌 → Xbox 用户令牌 → RETAIL XSTS → 当前账号资料。
- 遍历 Titlehub 游戏历史分页；不会因单页少于 100 条就提前结束。
- 最多选 3 款游戏，读取其全部成就分页，检查图片、解锁时间、原始 `rarity.currentPercentage` 字段是否实际返回。
- 查询 `MinutesPlayed`，兼容原生统计服务 `statlistscollection` 等响应；未知时长不当作零。
- 使用最新刷新令牌重新认证，确认仍为同一个账号。
- 报告只包含通过状态、样本数和字段覆盖情况，不含玩家名称、XUID、游戏名称、实际时长或令牌。没有合适样本时不会宣布全量验证通过。
- 各样本 `rarity`、`playtime` 为 false 时表示该样本未确认可取得此字段，并不意味着它的值是 0。
- `distinctProductIds` 仅是观察值，不能用它直接推断 DLC；`dlcMappingVerified` 保持 false。

## 官方与源码依据

- https://learn.microsoft.com/en-us/gaming/gdk/docs/services/fundamentals/s2s-auth-calls/service-authentication/live-website-authentication
- https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-device-code
- https://github.com/OpenXbox/xbox-webapi-python/tree/master/xbox/webapi/api/provider

当前发布工作流继续使用 Exophase。此验证不读取或修改现有加密游戏记录。
