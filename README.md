# 游迹 / Xbox Playlog

个人 Xbox 游戏记录、成就、游玩时长与成就热力图。站点：<https://sonder98.github.io/xbox-playlog-pages/>。

项目为 **React 19 + TypeScript + Vite** 静态网站，托管在 GitHub Pages。正式数据源已切换为 **微软 Xbox 官方只读接口**；Exophase 仅保留历史目录核对与补充分组工具，不参与正式定时同步。

## 主要功能

- 概览：最近游玩、游玩时长 TOP 5、完成度统计、最近同步变化、热力图入口。
- 游戏库：搜索、筛选、排序、隐藏游戏、游戏详情。
- 成就：简体中文名称与说明（官方没有中文时保留原文）、稀有度、积分、解锁时间、本体／追加内容分组。
- Mythic：**已验证的本体成就全部完成**；Full：**全部成就完成**。分组未知时不推测。
- 成就热力图：按解锁日期查看月份、年份、每日成就；支持成就详情和游戏跳转。顶部「稀有成就展柜」跨当前展示的游戏汇总全球解锁率最低的 50 个已解锁成就；每组五座错落高度的拉丝金属领奖台可横向滑动，台面按成就名、游戏名、稀有度与解锁时间三行呈现，图片保持原比例；点击领奖台或入口进入纵向排行卡片详情。
- 加密数据：浏览器本地解锁，记住设备，导出 JSON／CSV、加密导入。
- 素材：澳区游戏英文名和正方形封面优先，详情横幅优先官方 TitledHeroArt，图片转 WebP 后在同站缓存；成就图片也缓存。
- 成就图片统一边框：展柜、每日成就详情和游戏详情成就列表使用相同分级。解锁率 ≥10%（或未知）使用灰色细描边，1%–<10% 使用动态镀金边框，<1% 使用更明亮的柔光；减少动态效果时停用流光动画。图片不裁切，未解锁成就仍沿用弱化视觉，不改变 Xbox 官方数据或排行。

## 正式同步与部署

| 文件 | 职责 | 触发 |
| --- | --- | --- |
| `.github/workflows/sync.yml` | Xbox 正式同步、加密快照、素材缓存 | 每小时 00/30 分 UTC（排队可能延迟）；同步代码变化或手动触发 |
| `.github/workflows/pages.yml` | 测试、构建、浏览器导航检查、GitHub Pages 部署 | 前端／工作流／快照推送或手动触发 |
| `.github/workflows/microsoft-shadow.yml` | 人工授权、compare 与 repair 工具 | 仅手动触发 |

同步任务运行 `scripts/microsoft-sync.ts`：恢复 **GitHub Actions 加密私有缓存**，续期 Microsoft OAuth → Xbox 用户令牌 → XSTS，读取游戏历史、成就及必要时长；查询澳大利亚区商店素材；转换缓存图片；用应用密码加密记录并发布 `public/vault.json`、`public/status.json`。使用 GitHub Actions cache 保存授权状态及图片，自动部署时不会把明文账户数据放进仓库。

增量策略（2026-11-01 更新）：

1. 每轮检查 Xbox 官方游戏列表、成就数、已解锁数、玩家积分和最近游玩时间；新增或变化的游戏重新读取完整成就目录。
2. 已有完整目录且这些摘要未变化时复用成就明细；本体分组尚未查明的游戏也可以复用，避免每半小时重复请求。
3. 最近 **7 天**玩过的游戏及没有有效时长记录的游戏仍查询最新 MinutesPlayed；其他未变化游戏复用旧时长。历史游戏重新游玩后，其最近游玩时间变化将触发完整读取。
4. 北京时间约 **10:00–11:00** 对应的第一个成功同步窗口执行每日完整目录刷新，重新获取稀有度并尝试验证缺失分组。由于 GitHub 任务可能延迟，该窗口并非精确执行时间。
5. 仍保留 Xbox 请求间隔约 1.05 秒和 HTTP 429 中止保护，不以并发冲刺突破限流。
6. 日志输出 `微软扫描统计`（全量／增量、复用成就数、明细读取数、时长读取／跳过数、耗时），以及澳区素材和图片缓存耗时，方便持续量化优化收益。

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
| `scripts/microsoft-sync.ts` | 正式同步入口、加密、发布 |
| `scripts/microsoft-artwork.ts` | 澳大利亚区游戏封面／详情横幅 |
| `scripts/image-cache.ts` | WebP 预处理与缓存 |
| `src/dashboard.tsx` | 概览／游戏库／热力图路由／设置 |
| `src/components/achievement-heatmap.tsx` | 日期热力图、日成就卡片 |
| `src/rare-achievements.ts` | 已解锁成就跨游戏稀有度排行 TOP 50 |
| `src/components/game.tsx` | 游戏卡片、成就明细 |
| `src/vault.ts` | 解锁、同步工作流入口与本地导入 |
| `docs/HANDOFF.md` | 项目交接、现状和维护注意事项 |

## 常见故障检查

- 同步慢：先看 `Sync Xbox records` 日志中的 `fullRefresh`、`reusedDetails`、`detailedReads`、`statsReads`、`scanSeconds`；每日全量刷新会比半小时增量慢。
- 封面缺失：先检查澳区商店数据匹配、`ProductKind`、`ImagePurpose`、图片源是否允许访问，以及图片缓存是否回退微软原图。
- 成就分组未知：不要根据积分或数量猜测本体／DLC，等待官方有效分组或唯一可验证的目录补充分组。
- GitHub Pages 未更新：检查 `Deploy Playlog` 是否成功；由 bot 提交的快照不会自动触发 push workflow，`sync.yml` 会显式派发部署。
