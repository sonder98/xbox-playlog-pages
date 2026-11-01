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

- `src/playtime-ledger.ts`：加密 vault 顶层 `playtimeLedger`，包含 `version`、`timeZone:Asia/Shanghai`、`since:2026-11-01`、`latest`（每游戏最新**真实测量**）、`days`（当日两次真实测量的正增量）、`crossDay`（跨日区间无法确认归属的正增量）、`corrections`（时长回退次数）。仅作为未来功能的数据基础，不更改当前界面。
- `scripts/microsoft-library.ts`：扫描额外返回 `statsSamples`，只记录通过 Xbox `MinutesPlayed` 接口**实际成功获得**的时长与采样时间；复用旧值不形成样本。北京时间 23:40–23:59/00:00–00:12（或 GitHub 专门 cron 强制）对非隐藏的普通 Xbox 游戏全面刷新游戏时长，其他时间保留原近期游戏优先策略。旧 Xbox360 不可用的时长不凭空推断。
- `scripts/microsoft-sync.ts`、`scripts/snapshot.ts`：合并真实采样差值进入持久 `playtimeLedger`，与每次新快照一起 AES-GCM 加密并写入 GitHub Release 的 `vault.json`；快速复用已有快照时保持已有账本不变。**账本不随最近 30 次快照裁剪**。
- 时区固定北京时间，未来 UI 不可简单地把跨日间隔都计入结束日期，也不能把 Xbox 缓存读数等同实时游玩。部分数据只能称“采样估计”，以前的数据不能准确追溯。
- 自动 cron 通常北京时间每小时 17、47 分，UTC 15:00 的整小时被北京时间 23:42 专用采样替换（`42 15 * * *`），UTC 16:02 增加次日零点基线（`2 16 * * *`）；GitHub cron 不提供准点保障。专用 cron 运行时将 `PLAYTIME_FORCE_SWEEP=true` 传给 Xbox 同步。
- `tests/playtime-ledger.test.ts` 检验北京时间日期、午夜边界、跨日未归属、回退、重复读数、旧快照兼容。新增字段无敏感信息输出到公共 Actions 日志；全部账本只在用户密码加密快照中。
