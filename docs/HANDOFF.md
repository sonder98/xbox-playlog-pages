# 游迹 Xbox Playlog 交接文档

更新时间：2026-10-31（香港时间）

## 项目目标

这是一个部署在 GitHub Pages 上的个人 Xbox 游戏记录网站：

- 网站地址：<https://sonder98.github.io/xbox-playlog-pages/>
- 仓库：`sonder98/xbox-playlog-pages`
- 本地工作目录：`/workspace/scratch/9549d049124d/xbox-playlog-redesign`
- 当前主数据源：微软 Xbox 官方接口
- 旧数据源：Exophase，已退出正式同步流程，仅保留历史核对代码和部分目录缓存

## 当前线上状态

微软正式同步已经成功跑通过，线上快照包含：

- 117 个有完整成就数据的游戏
- 6,499 项成就图片和稀有度
- 4,556 条解锁时间
- 116 个游戏有游玩时长
- 117 个游戏识别到官方本体成就分组
- 43 个游戏识别到追加内容成就分组

正式切换和图片缓存成功的工作流：

- <https://github.com/sonder98/xbox-playlog-pages/actions/runs/41174680353>

这次全量同步中，澳大利亚区商店匹配到 110/150 个条目的英文名称和封面；进入正式快照的 117 个游戏中，109 个封面被缓存为 WebP，6,499 张成就图片被缓存。

## 最近一次封面 Bug

用户反馈 `REANIMAL`、`WUCHANG: Fallen Feathers` 等游戏没有封面。

根因是 `scripts/microsoft-artwork.ts` 原来要求澳区商店查询必须满足：

1. 返回结果只有一个商品；
2. 商品类型必须严格是 `Game`。

这类游戏通常同时存在标准版、豪华版、Friend's Pass 等商品，因此被旧逻辑直接跳过。修复已经推送到主分支：

- 会遍历返回的所有商品和本地化信息；
- 优先选择英文标题与 Xbox 历史游戏名最匹配的商品；
- 优先选择 `BoxArt` 方形图片；
- 支持 `Game`、`GameEdition` 等商品类型；
- 没有澳区匹配时保留微软 Titlehub 原始封面，不清空原图。

当前主分支 HEAD：`e5a4e795cb383f1cb79fd348b3f38ea135fb3d05`。

封面修复对应的最新发布任务：

- `41199489880`：旧任务仍在运行；
- `41199538559`：包含最终修复的任务，当前排队等待前一个任务释放并发锁。

下一位 agent 首先检查这两个任务的最终状态。不能在工作流仍失败时宣称线上修复完成。

## 数据同步架构

### 正式工作流

文件：`.github/workflows/pages.yml`

- 每小时 `00` 和 `30` 分运行：`0,30 * * * *`
- 主同步命令：`node --experimental-strip-types scripts/microsoft-sync.ts`
- 使用 GitHub Actions cache 保存加密的微软私有状态
- 同步成功后提交 `public/vault.json` 和 `public/status.json`
- GitHub Pages 随后构建并部署
- `MICROSOFT_STATE_KEY`、`APP_PASSWORD`、微软授权缓存等都不进入公开仓库

### 微软同步入口

文件：`scripts/microsoft-sync.ts`

流程：

1. 从加密缓存恢复微软授权和候选快照；
2. 刷新 Microsoft OAuth / Xbox user token / XSTS；
3. 读取当前账号 Titlehub 游戏历史和 Achievements history；
4. 读取每个变化游戏的成就目录、解锁状态、稀有度、图片、解锁时间、分组和游玩时长；
5. 查询澳大利亚区微软商店目录，替换游戏英文名和方形封面；
6. 把封面和成就图片转换为 WebP；
7. 使用 `APP_PASSWORD` 加密并发布 `public/vault.json`。

### 增量同步优化

文件：`scripts/microsoft-library.ts`

已经加入快速路径：

- 每轮仍读取历史摘要和游玩时长；
- 如果游戏拥有旧的完整成就、已验证本体/DLC 分组，且最近游玩时间、成就总数、已解锁数、当前分数都没有变化，则复用旧成就明细和分组；
- 新游戏、成就摘要变化、记录不完整的游戏会重新读取完整成就分页；
- 已匹配的澳区英文封面会复用。

注意：这次优化的第一轮云端发布曾因 `old.achievements` / `old.groups` 的 TypeScript 严格检查失败，已经在当前 HEAD 修复。失败任务是 `41197210868`，不要把它当作最终状态。

## 数据语言和图片规则

- 游戏历史和商店目录：澳大利亚区，优先 `en-AU`，回退其他英文；
- 成就名称和描述：微软 Xbox 接口默认请求简体中文；如果游戏没有官方中文元数据，则保留微软返回的原文；
- 游戏图片：优先微软商店 `BoxArt` 原生方图；游戏列表和详情保持方形比例，不再裁切横图；
- Mythic 游戏：封面外侧绿色发光包框、底部星芒与月桂装饰；不显示独立徽章；
- 图片缓存：`scripts/image-cache.ts`，封面 480/1600 宽度，成就图 168 宽度，WebP 缓存放在 `public/media`；
- 如果源图下载失败，前端仍使用原始微软地址回退。

## 成就分组和统计规则

- 官方 `completion.groups` 中明确的 `BaseGame` 作为本体；
- 其余成就统一归入“追加内容/DLC”，不推断具体 DLC 名称；
- 如果官方分组缺失，只有 Exophase 目录与 Xbox 成就 ID、名称和分数形成完整唯一映射时才补充分组；
- Mythic：本体成就全部完成；
- Full：本体、追加内容和更新成就全部完成；
- 成就排序只影响各组内部顺序，不会混淆本体和 DLC；
- 解锁时间默认从新到旧，也支持正序、稀有度正序和稀有度倒序。

## 认证和私有状态

已配置的 GitHub Actions secrets：

- `APP_PASSWORD`：用于解密和重新加密网站快照；
- `MICROSOFT_STATE_KEY`：用于 AES-256-GCM 加密微软授权和候选快照；
- `XBOX_CLIENT_ID` 等只在授权流程需要时使用，正常续期使用加密缓存。

不要要求用户再次提供密码、刷新令牌或 XUID。不要打印或下载真实的 `auth.json`、`candidate.json`、刷新令牌或解密后的真实快照。

设备授权工作流：`.github/workflows/microsoft-shadow.yml`。它现在主要用于手动授权、compare 和 repair，不要把候选快照直接当作线上数据。

## 前端主要位置

- `src/dashboard.tsx`：概览、游戏库、统计卡片、同步说明；
- `src/components/game.tsx`：游戏封面、游戏卡片、Mythic 包框；
- `src/style.css`：深色主题、方形封面、移动端布局、发光边框；
- `src/main.tsx`：解锁页面、密码记忆和账号状态；
- `src/achievement-sort.ts`：成就组内排序；
- `src/display-preferences.ts`：隐藏游戏设置；
- `src/navigation.ts`：全部游戏、详情页、返回和滚动恢复。

## 后续工作建议

按以下顺序继续：

1. 等待 `41199538559` 完成，确认构建、页面部署和同步步骤全部成功；
2. 用网站解锁后检查 `REANIMAL` 和 `WUCHANG: Fallen Feathers` 是否显示方形封面；
3. 若仍缺图，查看该游戏的微软商店 lookup 返回商品标题、`ProductKind` 和 `ImagePurpose`，再补充匹配规则；
4. 查看增量同步新运行的耗时和日志，确认稳定游戏进入复用路径；
5. 后续优化优先保持微软数据源，不要重新引入 Exophase 正式同步；
6. 如果改动工作流，注意 GitHub Pages 的同步提交可能与代码提交产生并发冲突，提交快照前要基于最新 `main` 做 rebase 或使用已有冲突处理逻辑。

## 常用验证

本地构建：

```bash
npm run build
```

网站：

```text
https://sonder98.github.io/xbox-playlog-pages/
```

不要运行真实账号同步的本地命令，也不要把真实微软授权或快照复制到工作区。
