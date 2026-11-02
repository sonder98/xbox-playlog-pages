# XBOX Playlog Xbox Playlog 开发交接

更新：2026-11-01。以 GitHub 仓库 `main` 最新代码和 GitHub Actions 运行记录为准，勿照搬早期对话的结论。

## 项目与环境

- 仓库：<https://github.com/sonder98/xbox-playlog-pages>
- 线上：<https://sonder98.github.io/xbox-playlog-pages/>
- 栈：React 19、TypeScript、Vite、Node.js 22、GitHub Pages、GitHub Actions。
- 官方数据源：Microsoft Xbox；旧 Exophase 工具已退出正式同步，仅作为历史核对或分组目录补充。
- 使用 Github GitHub App 连接即可读取和修改该仓库，不依赖上一位 Agent 的临时本地目录。

## 最近确认的运行事实

- 2026-11-01 08:09 北京时间附近完成的同步运行：<https://github.com/sonder98/xbox-playlog-pages/actions/runs/41254682844>
- 扫描范围 150 个条目；正式加密快照 117 个游戏；WebP 成就图片 6,499 张；封面缓存覆盖 117/117。澳区商店识别 118/150 个候选条目，识别数不等于最终快照游戏数。
- 这次 `微软同步 20/150` 至 `150/150` 花费约 11 分钟，图片缓存 0 下载、6,746 复用，瓶颈在 Xbox 数据拉取而非媒体转换。
- 同日 Pages 部署成功：<https://github.com/sonder98/xbox-playlog-pages/actions/runs/41255540721>。
- 这些是上述运行的历史观测；后续更新以最新任务结果为准。

## 正式链路

1. `.github/workflows/sync.yml`：常规 UTC 17/47 分尽力定时触发（UTC 15 点例外），恢复受加密保护的微软授权状态、最新加密快照及公共素材，运行 `scripts/microsoft-sync.ts`，将加密快照与公共图片归档上传到 GitHub Release `playlog-live`，显式派发 `pages.yml`。**不再反复提交大体积随机密文到 Git**。
2. `.github/workflows/pages.yml`：从 Release 恢复最新加密快照，校验 Actions 图片缓存与 Release 素材清单（缺失则解压公共图片归档），npm test → 构建 → 浏览器导航检查 → GitHub Pages 部署。初期 Git 里的旧加密快照仅作为 Release 尚未建立时的兜底。
3. `.github/workflows/ci.yml`：PR 单测、构建及 Playwright（不使用真实 Xbox 凭据、不进行正式部署）。
3. `.github/workflows/microsoft-shadow.yml`：手动首次／重授权、compare、repair；不将候选快照直接发布为正式网站数据。

### 增量同步优化（2026-11-01）

入口 `scripts/microsoft-library.ts`：

- 每轮刷新游戏历史及相关摘要。
- 新游戏、当前摘要发生改变（最后游玩时间、成就总量、已解锁量、积分）或没有完整旧成就目录的游戏读取全量成就。
- 无变化且有完整目录时复用旧成就明细；`groupStatus=unavailable` 的游戏也可以复用。缺失必要官方成就数量摘要但最后游玩时间未变时，先比对微软的已解锁成就 ID，一致则复用（`verifiedEarned`）；有新增则完整拉取。尚未解锁的新增 DLC 在每日全量目录刷新时发现。
- 对最后游玩时间在近 7 天内、或者旧时长缺失的游戏继续查 MinutesPlayed；更早的未变游戏复用旧时长。
- 每个 UTC 自然日首次进入 **02:00–02:59** 窗口时执行全量目录刷新，更新稀有度、补查未验证分组；防止永久缓存使稀有度/分组过时。若该时段没有任何运行，会延后到下一次符合条件的窗口。
- 官方请求仍固定限速 1.05 秒一次，429、401 属于中止错误。不要为了提速直接删除限流。
- 在同步日志中检查 `fullRefresh`、`reusedDetails`、`detailedReads`、`statsReads`、`statsSkipped`、`scanSeconds`。实际线上耗时应以部署后新运行验证；不要预先承诺一定降低到某个数值。

### 准确性原则

- 仅使用官方 `completion.groups` 完整的 BaseGame 识别本体，其余为 DLC／追加内容；或使用游戏名称、分数、成就 ID 完整唯一映射的历史目录补充分组。
- Mythic 代表本体全成就，Full 代表全部成就完成；分组未知不要臆测。
- 游戏封面和英文名称优先澳大利亚区，成就名及描述优先微软简体中文；没有中文时原样保留。
- `scripts/microsoft-artwork.ts` 会在多个商店版本中匹配并优先返回方形 BoxArt；详细横幅优先 TitledHeroArt，失败则回退既有官方图。
- `scripts/image-cache.ts` 将允许的封面、横幅和成就图缓存为 WebP；未下载成功时可回退微软原始地址。

## 安全边界

- `APP_PASSWORD` 加密站点档案，`MICROSOFT_STATE_KEY` 单独加密微软授权及候选快照。
- 轮换密码可使用临时 `NEW_APP_PASSWORD`；请勿直接丢弃旧密码导致快照无法解锁。
- 不打印、不下载、不转发真实 `auth.json`、`candidate.json`、刷新令牌、XUID、网站密码或明文游戏快照。
- 修改、合并、重跑正式工作流后应检查 GitHub Actions，确认同步及 Pages 均成功。
- 最新加密快照和公共 WebP 素材存于 GitHub Release `playlog-live`，通过 `scripts/live-assets.mjs` 恢复/发布。保持加密，绝不上传令牌。同步和 Pages 共用并发组，避免新旧资源交错。首次验证 release 上传和部署成功前不要清理原 Git 快照。已经存在的仓库 Git 历史不会因为停止未来提交自动缩小，不要未经备份强推重写历史。

## 前端定位

- `src/dashboard.tsx`：概览、游戏库、设置和页面入口。
- `src/components/game.tsx`：游戏卡片、详情、成就目录、Mythic 封面效果。
- `src/components/achievement-heatmap.tsx`：`AchievementPreview`（首页预览）、`AchievementJourney`（完整热力图和某日详情）、`DayCard`（成就卡片）。
- `src/achievement-activity.ts`：按日期聚合已解锁成就。
- `src/navigation.ts`：详情页切换、浏览器返回和滚动状态。
- `src/style.css` 与热力图对应 CSS：黑灰底、电光绿、移动端响应式。
- `src/vault.ts`：客户端解锁、同步入口，指向正式同步任务 `sync.yml`。
- `tests/`：Node 自动化测试。

## 已确认的后续设计需求（暂未进入代码）

用户希望升级 **完整成就热力图页面**：

1. 移除顶部四项指标：累计成就、活跃天数、最长连续、单日最高。
2. 在年份导航前增加单行横向滚动的「稀有成就展柜」；仅展示已解锁成就图片，跨所有游戏取全球玩家稀有度最低的 50 项，升序排列。
3. 与热力图首页预览相似，圆形箭头进入独立 `TOP 50` 详情页。
4. 详情页从上往下显示成就卡片，复用日期详情 `DayCard` 的布局，包含成就名、描述、稀有度、玩家积分、所属游戏及解锁时间；返回时恢复滚动状态。
5. 目前只有视觉设计稿，**用户要求先看设计、未授权直接实现该热力图改动**。

## 验证

```bash
npm ci
npm test
npm run build
```

正式上线除了测试通过，还要检查 `Sync Xbox records`、`Deploy Playlog` 的结论和网站主要交互，尤其是 `REANIMAL` 与 `WUCHANG: Fallen Feathers` 封面、Mythic／Full、成就分组、热力图日详情、移动端滚动。

涉及微软首次授权请参照最新 `MICROSOFT_SETUP.md`，勿要求用户粘贴真实刷新令牌。

## 2026-11-01 Mythic / 可靠性修复

- Compact Mythic cover 使用 `object-fit:cover` 并 `display:block`，使图片铺满宝石外框；详情封面保持不裁切，并保留外框底部装饰不被剪断。增加非严格 1:1 图片在桌面和移动端的边缘回归测试。
- 定时任务先从 GitHub 高负荷的 00/30 分改至 11/41 分，发现三个计划时间未触发后重新登记为 17/47 分；GitHub cron 本身仍不提供准点 SLA。若需要严格半小时，应另接可靠外部调度器。
- GitHub Release 发布流程首次上线需核对 `Sync Xbox records`、Release 资产清单（`vault.json`、`status.json`、`media-index.txt`、`playlog-media.tar.gz`）与 Pages 最终渲染，不成功时不要删除原加密快照。

### 2026-11-01 网页手动同步

- src/manual-sync.ts：调用 GitHub Actions workflow_dispatch 并按 request_id 从公开状态 API 定位本轮 Sync 与 Pages 工作流；不会把其他 push/schedule 当作本轮触发。
- src/components/manual-sync.tsx：首次授权和一键触发、进度轮询、成功后刷新已解锁快照、会话内恢复查询；没有服务端 GitHub 凭据。
- src/vault.ts：浏览器本地 GitHub fine-grained PAT 用 APP_PASSWORD 进行 PBKDF2/AES-GCM 加密。令牌只提交至 api.github.com。撤销本机授权与 GitHub 端令牌失效是两个操作。
- sync.yml 与 pages.yml 使用可选 workflow_dispatch.inputs.request_id，运行标题包含 UUID，sync 派发 Pages 时安全传递请求 ID。仅网页手动同步需要 fine-grained token 的 Actions:write（限定本仓库）。
- tests/manual-sync.test.ts 与 scripts/check-navigation.mjs 使用模拟 API / 假令牌回归。不要在测试中引入真令牌或微软授权。

### 从 2026-11-01 起按日记录游戏时长

- `src/playtime-ledger.ts`：加密 vault 顶层 `playtimeLedger`，包含 `version`、`timeZone:Asia/Shanghai`、`since:2026-11-01`、`latest`（每游戏最新**真实测量**）、`days`（当日两次真实测量的正增量）、`crossDay`（旧版兼容字段，内容自动归并到前一天并清空）、`corrections`（时长回退次数）。仅作为未来功能的数据基础，不更改当前界面。
- `scripts/microsoft-library.ts`：扫描额外返回 `statsSamples`，只记录通过 Xbox `MinutesPlayed` 接口**实际成功获得**的时长与采样时间；复用旧值不形成样本。北京时间 23:40–23:59/00:00–00:12（或 GitHub 专门 cron 强制）对非隐藏的普通 Xbox 游戏全面刷新游戏时长，其他时间保留原近期游戏优先策略。旧 Xbox360 不可用的时长不凭空推断。
- `scripts/microsoft-sync.ts`、`scripts/snapshot.ts`：合并真实采样差值进入持久 `playtimeLedger`，与每次新快照一起 AES-GCM 加密并写入 GitHub Release 的 `vault.json`；快速复用已有快照时保持已有账本不变。**账本不随最近 30 次快照裁剪**。
- 时区固定北京时间，跨日区间按照用户约定统一归入上一次有效采样日，也不能把 Xbox 缓存读数等同实时游玩。部分数据只能称“采样估计”，以前的数据不能准确追溯。
- 自动 cron 通常北京时间每小时 17、47 分，UTC 15:00 的整小时被北京时间 23:42 专用采样替换（`42 15 * * *`），UTC 16:02 增加次日零点基线（`2 16 * * *`）；GitHub cron 不提供准点保障。专用 cron 运行时将 `PLAYTIME_FORCE_SWEEP=true` 传给 Xbox 同步。
- `tests/playtime-ledger.test.ts` 检验北京时间日期、午夜边界、跨日未归属、回退、重复读数、旧快照兼容。新增字段无敏感信息输出到公共 Actions 日志；全部账本只在用户密码加密快照中。

### 2026-11-01 前日归属及 UI 限定

- `appendPlaytimeSamples` 把任何跨午夜、多日间隔的新增分钟都归到**前一条有效采样**的北京时间日期，旧 `crossDay` 数据在下一轮加密快照更新时一次性迁入对应的前一天，并清空旧桶；后续读写保持幂等。若中间漏掉多轮同步可能高估前一天，不假装准确追溯。
- 成就热力图 **Sheet 半屏弹层** 每游戏“X 个 · Y 小时”，小时取 `dailyGameMinutes(playtimeLedger, day, titleId)`；没有采样显示“— 小时”。**不要修改完整日期成就页**。
- `RecentGamesRail` 概览卡片现采用封面 → 游戏名 → **单独一行累计游玩时长** → **单独一行完整进度条 + 完成百分比**。缺失 Xbox 时长显示 `— h`。保持进度为本体 + DLC 总进度，不修改 Mythic / Full 逻辑；手机与桌面通过浏览器几何回归验证进度条不再被时长挤压。

 
### 吃灰游戏交接（2026-11-01）
- 31 款 Xbox 官方缺少 `visible` 布尔字段的游戏进入「吃灰游戏」候选；取 `lastPlayed` 与最后有效 `unlockedAt` 中较晚日期，按 Asia/Shanghai 自然日差降序。无有效时间戳则不排名。
- 概览 TOP 5 放在「间隔最久成就」之后，`#dusty` 为完整排序列表，无新增底部导航入口。相关文件：`src/dusty-games.ts`、`src/components/dusty-games.tsx`、`src/navigation.ts`、`src/dashboard.tsx`、`src/style.css`。
- `scripts/fixed-pc-metascores.ts` 保存人工核对过的 29 条固定 PC Metacritic 0–100 分，**键是 HMAC-SHA256(titleId, MICROSOFT_STATE_KEY).slice(0,32)** 而不是公开 Title ID，防止泄露非展示游戏清单；`scripts/microsoft-sync.ts` 的快速与完整路径都在 `publishSnapshot` 时生成 `metacriticScores` 并存入 AES-GCM 加密快照。解锁后 `src/vault.ts` 提供 `pcMetascoresForDisplay()`。完整备份含该映射。
- 31 款候选中 29 款有人工核验 PC Metascore；另 2 款为 tbd，保持无评分。对于原版和特别版非同一评分的情况，在加密数据中保留版本备注。评分为人工快照，不随常规 Xbox 同步更新；若重设 MICROSOFT_STATE_KEY 需要迁移 HMAC 映射。
- 临时 RSA 加密库存清单导出工作流已删除，不要把私有 Title ID、完整清单或任何认证密钥写入公开库。验证新快照是否包含分数使用汇总数量日志或私有解密环境，不打印标题/ID。

### 2026-11-01 概览布局精简
- 已按用户要求完全移除「时光最多的世界」累计游玩 TOP 5 轮播。`src/dashboard.tsx` 不再渲染 `data-overview-section="top"`，不再计算 `top`，删除专用样式。概览顺序为热力图 → 最近游玩 → 成就展柜 → 吃灰游戏 → 统计总览；保留欢迎占位、统计和游戏详情。`scripts/check-navigation.mjs` 在移动端/桌面端回归该顺序和删除项。

### 2026-11-01 侧栏/底部四 Tab 重组
- 固定四个主入口：1「概览」(`#overview`)、2「游戏库」(`#library`)、3「成就」(`#achievements`)、4「管理」(`#manage`)；手机仍在滚动时显示、停止后自动隐藏，PC 侧栏顺序相同。
- 「成就」直接打开原先从概览可进入的完整月度成就热力图（保留按年定位、日期弹层、日期成就详情、原有前进后退、游戏详情）；概览预览也继续直达此页。完整热力图根页的「返回概览」明确进入概览。
- 「管理」是原「连接与数据」和「同步历史」合并：上半部分保留微软自动同步、备份与本机导入、统计口径，下方独立标题「同步历史」和完整快照记录。所有云端同步、加密、本机导入和导出行为不变。
- 原网址书签 `#settings`/`#history` 通过 `src/navigation.ts` 兼容映射到 `#manage` 对应内容，后续新导航仅生成新 URL；测试验证移动/桌面四 Tab 顺序及层级、旧书签、完整热力图深链和滚动。

### 2026-11-01 底部 Tab 点击后显示 1.5 秒
- `src/dashboard.tsx` 的底部 Tab 点击会先清理旧的自动隐藏计时器，记录 `mobileNavKeepUntil=performance.now()+1500`，显式显示导航并重新设置 1500ms 隐藏；无论切换其他 Tab 或重复点击当前 Tab，都重新计时。
- `[tab,gameId,dayId,showcase,gapShowcase]` 路由变化 effect 在该点击保护期内**不再立即隐藏**；非点击切换仍按原规则隐藏。
- 滚动/触摸/滚轮行为仍使用原先 1000ms 自动隐藏，但新计时器不得早于点击所承诺的剩余保护时间；保护结束后导航恢复隐藏和 `pointer-events:none`，PC 侧栏不受影响。
- `scripts/check-navigation.mjs` 覆盖：默认隐藏、滚动显示及 1s 自动隐藏、切换后持续显示、重复点击延长 1.5s、到点隐藏及页面不被底栏拦截。

### 2026-11-01 Cloudflare 免费定时器（准备完成、待用户配置）
- GitHub `schedule` 长时间漏触发，手动 `workflow_dispatch` 成功证明 Xbox 数据链路正常。已准备 `cloudflare-sync/scheduler.mjs` 和 `docs/CLOUDFLARE_CRON_SETUP.md`；用户还需要在 Cloudflare 创建免费 Worker 并自行设置 GitHub fine-grained `Actions:write` Token 为 Worker Secret `GITHUB_ACTIONS_TOKEN`（不得在任何公开仓库、聊天或日志泄漏）。
- Cloudflare 三条 Cron 与旧 `sync.yml` 等价，单独处理北京时间 23:42 和 00:02 时长强制采样。`sync.yml` 已支持 `workflow_dispatch.inputs.force_sweep`，不会破坏已有网页手动同步或日终扫库。
- **暂时没有启用 Cloudflare、也没有关闭 GitHub `on.schedule`**。待 Cloudflare 至少一轮实测成功且 GitHub 同步/Pages 发布均成功后，再只删除 `sync.yml` 的 `schedule:` 块，避免迁移空窗和长期双重任务。

### 2026-11-02 手机端顶部下拉检查数据 / PWA 新版本
- `src/pull-to-refresh.tsx` 挂在已解锁的所有 Dashboard 路由；仅在手机视宽 ≤700px 且 window.scrollY 处于最顶部时，单指向下拖动约 120px（拉动指示条≥82px）并松开才触发。禁止误触发横向游戏卡片滑动、普通向上滚动、弹窗表单手势，不能把「查看最新网站数据」误认为手动 GitHub Xbox 同步。
- 先检查 `dist/version.json` 的网站 buildId，再调用 `refreshCloudRecords()` 从本站直接获取 `vault.json`，在当前已解锁页面更新游戏/成就/时长，不需要退出或重输密码；没变化显示「当前已是最新版本和数据」。`vite.config.ts` 在每次构建发布时生成版本信息，配合 build 内联常量对比。
- 如果前端 JS/CSS 有新版本，且用户此前显式选择「在此设备记住我」并有可恢复的加密凭据，则自动 reload 并复用现有安全解锁机制。**未选择记住设备时不得静默存储密码**：页面显示「新版本已上线，点击更新（需重新解锁）」，仅在用户主动点击「更新」时重载；不妨碍数据层在本页更新。
- PWA 现有 SW 仅缓存 JS/CSS/公共图片，加密档案和 version.json 采用网络请求；新前端 chunk 文件名哈希变化，刷新文档时会获取新 bundle。手动点击「立即同步」仍是真正调 GitHub Xbox 工作流，与下拉「读取最新已发布数据」区分。
- `scripts/check-navigation.mjs` 端到端涵盖横向手势不刷新、顶部拉动读新加密快照并继续解锁、发布版本变化在记住设备下自动 reload、新版 version.json 可从网页读取。保持现有手机底栏交互及 PC 页面不变。
