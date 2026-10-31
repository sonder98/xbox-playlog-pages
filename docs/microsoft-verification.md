# 微软直连验证（独立于线上 Exophase 同步）

首选全库任务：GitHub Actions → **Microsoft shadow sync**，支持加密持久授权和半小时影子同步（见后文）。

原始三款采样任务：**Verify direct Microsoft Xbox access**，仅用于一次性诊断，不保存授权。

先使用自己注册的微软应用完成授权。应用注册与用户授权成功不等于 Xbox 各接口均可访问，最终以验证报告为准。

## 无需在电脑安装程序的验证方式

1. 在 Microsoft Entra 的应用注册中注册自己的应用，例如 `Playlog`，支持账号选 **仅个人 Microsoft 帐户**。记录 **Application (client) ID**；这不是密码。
2. 在该应用的 Authentication / 身份验证中开启 **Allow public client flows / 允许公共客户端流**，用于设备代码授权。无需添加 Graph 权限，无需购买 Azure 计算资源或创建 client secret。
3. 打开验证工作流，点击 **Run workflow**，在 `client_id` 填自己的应用 ID。打开正在运行的 `verify` 任务中的授权步骤日志。
4. 日志会给出一个短期用户代码。在自己浏览器打开日志给出的微软验证地址（个人账号可能是 `https://www.microsoft.com/link`），输入代码；核对应用确为自己注册的应用，选择要验证的 Xbox 账号并授权。
5. 任务自动继续，最多等待授权 10 分钟。工作流不会保存令牌、修改 GitHub Secrets 或切换线上同步；授权到的账号用于本次自查，不代表已配置长期自动同步。

设备登录流程是否允许 Xbox scopes、应用是否有权访问所需服务，都要通过真实调用验证。若微软拒绝设备流程，可在自己的电脑使用仓库已有的 `scripts/microsoft-authorize.mjs`，通过原生应用 `http://localhost` 回调与 PKCE 授权，再将刷新令牌直接保存在 GitHub Secret `XBOX_REFRESH_TOKEN`，应用 ID 保存在 `XBOX_CLIENT_ID`。不要发送令牌或微软密码到聊天。

已有这两个 Secrets 时，手动任务可不填输入，直接执行已授权验证。工作流只有仓库只读权限，不把新令牌写回 Secrets；续期检查仅验证同一任务内的一次刷新，长期续期与安全持久化由后文的全库工作流完成。

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

## 全库影子同步（不切换网站数据源）

`Microsoft shadow sync` 工作流在 main 分支每小时 :00、:30 执行，也可手动运行。
首次手动运行填写自己的 Client ID；程序在日志中逐行显示微软返回的 verification URL 和 user code。
必须使用微软实际返回的入口，个人账号可能返回 `https://www.microsoft.com/link`，不能固定使用 devicelogin。
设备授权后先验证账号，再保存加密检查点，然后全库扫描。授权期间不要勾选调试日志。

### 长期授权与私有状态

- `MICROSOFT_STATE_KEY` 是随机生成的 256 位 base64url 密钥，作为 GitHub Actions repository secret 保存；不复用网站 APP_PASSWORD。
- `.private/microsoft/auth.json` 只写 AES-256-GCM 加密封装（scrypt 独立盐和领域分离），含最新刷新令牌、应用 ID、已确认的账号。写入采用临时密文文件和原子替换，权限 0600，目录 0700。
- `.private/microsoft/candidate.json` 同样加密，保存官方候选快照和核对结果。永远不被 Vite/Pages 打包，不进入 Git，不上传普通 artifact。
- Actions cache 只保存密文；它不是 Secret 存储。公共仓库的缓存可能被 fork PR 读取，因此解密密钥必须单独留在 repository secret，工作流不响应 PR，仅运行 main。
- 每次 OAuth 续期立即写回新的加密令牌；全库扫描前后分别保存不可变缓存检查点，工作流串行，避免令牌轮换竞争。
- 缓存是可淘汰的存储，不保证永久保留。缓存丢失、用户撤销授权或微软要求再次登录时，需要再次手动授权；不能承诺永不登录。
- 修改网站 APP_PASSWORD 不影响授权密文，但核对现有网站快照仍需正确 APP_PASSWORD。不要随意替换 MICROSOFT_STATE_KEY，否则旧的微软缓存将无法解密，需要勾选 reauthorize 重新授权。
- 本地从不需要取得真实用户刷新令牌或解密真实快照。公开 summary 只包含数量/覆盖结果。

### 数据核对与限制

- 游戏历史和每个游戏的成就均读取全部分页；检测重复令牌、重复 ID、空历史及摘要数量不一致。
- 成就优先读取 contract 6，兼容 4 / 2；稀有度缺失时在相同账号和 title ID 下补读元数据。新版协议是否可用，以真实账号核对输出为准。
- 官方分组只接受单游戏 completion 中明确的 BaseGame membership，并核验 ID 存在、没有重复及已解锁集合一致。其余成就统一标为“追加内容”，不伪造具体 DLC 包名。若官方分组缺失，仅在 Exophase 目录与 Xbox 明细的名称和分数形成完整唯一匹配时使用该目录，否则标为未知；不使用 1000G、编号或 productId 猜测。
- Xbox 360 使用 contract 1 的 titleachievements 目录与 achievements 已解锁列表合并。离线/哨兵日期不伪造成真实解锁时间；缺少图片、稀有度和时长如实报告。
- 所有请求只查询当前授权账号，固定 Xbox 服务主机；持续限速。401 / 429 停止本次扫描，不重试权限/安全拦截。失败项保留上一份直接同步数据；不删除暂时缺失的旧游戏。
- 与 Exophase 对照只使用唯一的规范化游戏名；成就解锁时间只在唯一名称+分数组合匹配时比较。时长差超过 6 分钟、解锁时间差超过 60 秒记录为差异，不据此判定任一来源错误。不同名字/重复版本显示未匹配或歧义，不强行合并。
- 网站继续使用原 public/vault.json，本工作流没有 contents write 或 Pages 部署权限，候选记录不能覆盖线上记录。

### 研究依据

Microsoft 官方 REST 文档描述分页、unlockedOnly、possibleOnly 和 contract 2；微软公开 SDK 当前使用 contract 2：
https://learn.microsoft.com/en-us/gaming/gdk/docs/reference/live/rest/uri/achievements/uri-achievementsusersxuidachievementsgetv2
https://github.com/microsoft/xbox-live-api/blob/main/Source/Services/Achievements/achievement_service_internal.cpp

XCT 对自己逆向结果的说明指出 contract 6 的 completion.groups / BaseGame；这是待实测的线索，不当作微软兼容性承诺：
https://xct.live/wiki/mythic

Xbox 360 分离目录与已解锁接口参考 OpenXbox 原始实现：
https://github.com/OpenXbox/xbox-webapi-python/blob/master/xbox/webapi/api/provider/achievements/__init__.py

Titlehub 请求 maxItems=5000，并在达到该上限时停止，不能将默认 100 条当作全库。若摘要不提供 totalAchievements，或返回零占位值，则从全部成就分页统计总数；同时用已解锁数量和摘要总 Gamerscore（如有）核对，拒绝将缺失字段当作零。

全库快照已保存后可在工作流 mode 选择 compare，只重新核对现有候选快照。比较时通过同一 Xbox Title ID 的官方英文 Titlehub 别名匹配本地化游戏名，遇到同名版本仍标为歧义。matchedAchievementDates 显示实际成功匹配且两侧均有时间的成就数量，避免把未能匹配的成就误报为时间一致。

mode=repair 只补查上一快照中 total=0 且明细为空的条目，尝试旧版 titleachievements/achievements 接口；不依赖 Titlehub 旧版标记一定存在。候选快照合并时保留其他已核验游戏，报告单列尝试、恢复和仍为空的数量。对于旧版接口，以其完整目录和已解锁列表为准，不将 Titlehub 的零占位已解锁数量作为真零。

全库扫描额外合并 Achievements 服务 contract 2 / 1 的 history/titles，不仅依赖 Titlehub 最近游玩历史。排除 LiveApp 和旧版应用类型，仅把有效游戏条目合并；补查时只处理空目录和新发现的 ID，已有通过项保留。现代版本返回空列表时仍继续尝试 4 / 2，再尝试旧版 1。

compare 还会读取并缓存与同一 Title ID / 成就 ID 集合一致的官方英文目录，用于成就名称匹配和 DLC 包名补充；不替换界面名称，目录集合不一致时不合并。对照关系是一对一的，同名多平台条目不能重复认领同一条 Exophase 记录。
