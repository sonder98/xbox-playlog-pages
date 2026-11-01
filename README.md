# XBOX Playlog / Xbox Playlog

个人 Xbox 游戏记录、成就、游玩时长与成就热力图。站点：<https://sonder98.github.io/xbox-playlog-pages/>。

项目为 **React 19 + TypeScript + Vite** 静态网站，托管在 GitHub Pages。正式数据源已切换为 **微软 Xbox 官方只读接口**；Exophase 仅保留历史目录核对与补充分组工具，不参与正式定时同步。

## 主要功能

- 概览：热力图入口（含「本月在玩」游戏行）、最近游玩横向封面画廊（封面／名称／**全成就完成率**，本体与 DLC 都计入）、两个 TOP100 成就展柜、游玩时长 TOP 5、完成度统计与同步变化。
- 游戏库：搜索、筛选、排序、隐藏游戏、游戏详情。
- 移动端底部导航：四个 Tab 默认收起，纵向滑动／滚动页面时浮现，停止操作约 1 秒后自动隐藏；切换页面后再次收起，保留键盘聚焦可见性和安全区适配。
- PWA：支持 iPhone 添加到主屏幕、独立窗口启动、图标及公开静态资源缓存；加密快照始终联网获取。免费镜像托管操作与限制详见 [PWA 试运行说明](docs/PWA_FREE_HOSTING.md)。
- 成就：简体中文名称与说明（官方没有中文时保留原文）、稀有度、积分、解锁时间、本体／追加内容分组。
- Mythic：**已验证的本体成就全部完成**；Full：**全部成就完成**。分组未知时不推测。
- 成就热力图：按解锁日期查看月份、年份、每日成就；每个月日历下增加「本月在玩」游戏封面／游戏名列表，概览的最近 30 天热力图下也显示当前月份的游戏列表，点击可看游戏详情。仅用官方最近游玩时间（包括已有快照）和真实成就解锁时间确认月份，不根据累计时长或游戏库存在情况推断未记录的游玩。支持成就详情和游戏跳转。「稀有成就展柜」现在位于概览页「最近游玩」下方，跨当前展示的游戏汇总全球解锁率最低的 100 个已解锁成就；单行横向滚动展示保留原比例的图片和下方稀有度，点击箭头进入排行卡片详情（含解锁率、积分、时间与所属游戏）。
- 间隔最久成就：概览页中的第二个横向展柜，按每个游戏**连续两次已解锁成就**的真实时间间隔（而不是游戏首末成就跨度）统计，跨游戏取最长 TOP100；用错位重叠的成就对展示，点击进入双成就对称详情（较早/较晚成就、完整解锁条件、日期、游戏和间隔天数，保留 1 位小数）。仅使用有效 Xbox 成就解锁时间，不需要额外 API 或改动加密快照。
- 加密数据：浏览器本地解锁，记住设备，导出 JSON／CSV、加密导入。
- 素材：澳区游戏英文名和正方形封面优先，详情横幅优先官方 TitledHeroArt，图片转 WebP 后在同站缓存；成就图片也缓存。
- 成就图片统一边框：展柜、每日成就详情和游戏详情成就列表使用相同分级。解锁率 ≥10%（或未知）使用灰色细描边，1%–<10% 使用动态镀金边框，<1% 使用更明亮的柔光；减少动态效果时停用流光动画。图片不裁切，未解锁成就仍沿用弱化视觉，不改变 Xbox 官方数据或排行。

## 正式同步与部署

| 文件 | 职责 | 触发 |
| --- | --- | --- |
| `.github/workflows/sync.yml` | Xbox 正式同步、加密快照、素材缓存 | 每小时 17/47 分 UTC（GitHub 定时任务不保证准点）；同步代码变化或手动触发 |
| `.github/workflows/pages.yml` | 测试、构建、浏览器导航检查、GitHub Pages 部署 | 前端／工作流修改，或正式同步完成后的手动派发 |
| `.github/workflows/microsoft-shadow.yml` | 人工授权、compare 与 repair 工具 | 仅手动触发 |

同步任务运行 `scripts/microsoft-sync.ts`：恢复 **GitHub Actions 加密私有缓存**，续期 Microsoft OAuth → Xbox 用户令牌 → XSTS，读取游戏历史、成就及必要时长；查询澳大利亚区商店素材，缓存 WebP 并在 runner 上加密记录。

`scripts/live-assets.mjs` 将 **已加密** 的 `vault.json`、`status.json` 发布到 GitHub Release `playlog-live`，同时维护公共 WebP 素材归档和文件大小校验清单。正式同步不再向 Git 提交随机密文；Pages 构建从 Release 恢复最新数据，素材缓存丢失时从归档恢复。首次启用 Release 前，仓库中旧的加密快照保留为迁移兜底；不要在新发布链路验证成功前删除该文件。所有授权凭证仍只放在加密私有缓存中，绝不进入 Release、Git 或 Pages。

增量策略（2026-11-01 更新）：

1. 每轮检查 Xbox 官方游戏列表、成就数、已解锁数、玩家积分和最近游玩时间；新增或变化的游戏重新读取完整成就目录。
2. 已有完整目录且总成就数、已解锁数与最近游玩时间未变化时复用明细；积分摘要缺失不影响复用。缺少成就数量摘要但最近游玩时间未变时，先向官方拉取一次 **已解锁成就 ID** 校验：不变则复用，有新增则完整重查；新增但尚未解锁的 DLC 总量由每日全量刷新发现。
3. 最近 **7 天**玩过的游戏及没有有效时长记录的游戏仍查询最新 MinutesPlayed；其他未变化游戏复用旧时长。历史游戏重新游玩后，其最近游玩时间变化将触发完整读取。
4. 北京时间约 **10:00–11:00** 对应的第一个成功同步窗口执行每日完整目录刷新，重新获取稀有度并尝试验证缺失分组。由于 GitHub 任务可能延迟，该窗口并非精确执行时间。
5. 仍保留 Xbox 请求间隔约 1.05 秒和 HTTP 429 中止保护，不以并发冲刺突破限流。
6. 运行日志会区分 `reused`、`verifiedEarned`（已解锁 ID 校验后复用）与 `missingSummary`（校验未通过并全量读取）；日志输出 `微软扫描统计`（全量／增量、复用成就数、明细读取数、时长读取／跳过数、耗时），以及脱敏的 `reuseReasons` 聚合计数：新增、缓存不完整、每日全量、再次游玩、缺失必要摘要、总数变化、解锁数变化、积分变化和成功复用。不会输出游戏名、账号、令牌或快照内容。

> 首次同步、每日完整刷新和大量新游戏加入时仍可能较慢；半小时增量运行主要减少无变化游戏的重复调用。线上速度以最新 GitHub Actions 运行记录为准。

## 本地开发与验证

需要 Node.js 22.13+。

```sh
npm ci
npm test
npm run build
npm run dev
```

开发环境访问 `?demo=1` 可以浏览测试档案，**示例数据不会进入生产构建**。切勿在本机运行真实账号同步，或把微软令牌和解密后的私人游戏快照传给开发者／聊天。

## 密钥与数据安全

- `APP_PASSWORD`：网站私有快照的 AES-GCM 加密密码，保持与现有快照一致。
- `MICROSOFT_STATE_KEY`：GitHub Actions 私有微软授权／候选数据缓存的独立加密密钥。
- `NEW_APP_PASSWORD`：仅更换应用密码时临时使用；迁移后移除。
- 微软应用与续期凭据已走授权缓存，**不要**在公开仓库、PR、日志或聊天中粘贴访问令牌、刷新令牌、XUID 或明文快照。

一般无需重新授权；若授权状态失效，使用手动微软工作流及 `MICROSOFT_SETUP.md` 处理。变更网站密码请遵循：保留旧 `APP_PASSWORD`、临时提供 `NEW_APP_PASSWORD`，验证迁移成功后再替换旧值并删除临时值。

## 文件索引

| 代码 | 作用 |
| --- | --- |
| `scripts/microsoft-library.ts` | 游戏历史合并、成就明细、分组、缓存复用、时长、增量统计 |
| `scripts/microsoft-sync.ts` | 正式同步入口与加密 |\n| `scripts/live-assets.mjs` | GitHub Release 加密快照发布、WebP 持久归档与 Pages 恢复 |
| `scripts/microsoft-artwork.ts` | 澳大利亚区游戏封面／详情横幅 |
| `scripts/image-cache.ts` | WebP 预处理与缓存 |
| `src/dashboard.tsx` | 概览／游戏库／热力图路由／设置 |
| `src/components/achievement-heatmap.tsx` / `src/monthly-played.ts` | 日期热力图、本月在玩游戏列表及历史月份证据合并 |
| `src/components/recent-games.tsx` / `src/overall-achievement-progress.ts` | 最近游玩封面横滑卡和全部成就完成率（本体+追加内容） |
| `src/achievement-gaps.ts` / `src/components/achievement-gap-showcase.tsx` | 相邻成就间隔 TOP100、叠卡展柜、双卡解锁条件详情 |
| `src/rare-achievements.ts` | 已解锁成就跨游戏稀有度排行 TOP 100 |
| `src/components/game.tsx` | 游戏卡片、成就明细 |
| `src/vault.ts` | 解锁、同步工作流入口与本地导入 |
| `docs/HANDOFF.md` | 项目交接、现状和维护注意事项 |

## 常见故障检查

- 同步慢：先看 `Sync Xbox records` 日志中的 `fullRefresh`、`reusedDetails`、`detailedReads`、`statsReads`、`scanSeconds`；每日全量刷新会比半小时增量慢。
- 封面缺失：先检查澳区商店数据匹配、`ProductKind`、`ImagePurpose`、图片源是否允许访问，以及图片缓存是否回退微软原图。
- 成就分组未知：不要根据积分或数量猜测本体／DLC，等待官方有效分组或唯一可验证的目录补充分组。
- GitHub Pages 未更新：检查 `Sync Xbox records` 是否成功发布 Release，再核对 `Deploy Playlog`；同步工作流显式派发 Pages，不依赖 Git 密文提交。GitHub Actions cron 是尽力触发，超过半小时未跑不表示数据遗失，可手动派发同步。

### 网站内手动同步

解锁后点击右上角「立即同步」（手机端是刷新图标）。首次使用需到 GitHub 创建仅对 sonder98/xbox-playlog-pages 有效的 fine-grained personal access token，Repository permissions 中仅将 Actions 设置为 Read and write。粘贴进网页后点击「保存授权并立即同步」，此后再点击刷新图标即可直接发起同步。进度包括 GitHub 排队、Xbox 数据读取、Pages 部署，成功后网页会自动载入最新快照。未授权时仍可直接访问 GitHub Actions 手动运行。

此令牌由 APP_PASSWORD 加密，仅存在当前浏览器的 localStorage，浏览器仅将其直接发送给 api.github.com；从不将令牌放进源码、站点文件或日志。可以在弹窗「移除此设备授权」删除本机令牌；彻底撤销须去 GitHub 账户设置删除该 token。不同浏览器需要分别授权，切勿将令牌发送给他人或粘贴到聊天中。
