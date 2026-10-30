# 游迹 / GitHub Pages 展示版

静态网站从 Exophase 公开档案 `SondrRope` 读取 Xbox 游戏库和已解锁成就。GitHub Actions 每天自动同步，也会在更新同步脚本后执行一次；不需要 Xbox/Microsoft 应用、Xbox 登录令牌或 OpenXBL API Key。

## 唯一需要的 Secret

仓库 Settings → Secrets and variables → Actions 中保留 `APP_PASSWORD`，至少 8 位，用于加密同步历史。同步程序先用该密码解密旧快照，再把新快照加密保存，因此请使用原先设置的同一个密码。无需新建或填写 `XBOX_CLIENT_ID`、`XBOX_REFRESH_TOKEN`、`XBOX_CLIENT_SECRET` 或 `OPENXBL_API_KEY`。

## 数据与隐私

- 来源：Exophase 公共页面/API，玩家 ID `4285437`。
- `public/vault.json` 只存 AES-256-GCM 密文；网页在浏览器本机解密，密码不发送给网站。
- 解锁状态与时间来自公开 earned 接口；名称、描述、稀有度和本体／追加内容分组来自公开游戏成就页。分组与成就 ID、总数不一致时标为待确认，不猜测本体数量。
- Exophase 若改变公共接口或限制访问，同步会失败并保留此前的加密记录。

## 功能

游戏库、游玩时长、成就数量/完成度、逐项成就及本体／追加内容分组、Mythic／Full 筛选、搜索筛选、快照对比、备份导入导出。GitHub Actions → Publish and sync Playlog 可手动重新运行；每日定时任务约在北京时间 08:17 运行。

## 开发

Node 22.13+，运行 `npm install`、`npm install --no-save playwright`、`npm test`、`npm run build`。

`npm run dev` 后，开发模式下可通过 `?demo=1` 查看明确标注的示例档案，不需要真实密码。示例数据及入口不会进入生产构建。生产解密和记住设备需要 HTTPS（本机 localhost 除外）。

## 更换应用密码

保留原 APP_PASSWORD，新增 NEW_APP_PASSWORD（至少8个字符）。同步成功后，用新密码确认能打开网站，再把 APP_PASSWORD 更新为新密码并删除 NEW_APP_PASSWORD。迁移期间会兼容新旧密码并将全部历史快照用新密码重新加密。

## 新版统计与展示

- Mythic：本体成就全部解锁。Full：本体、DLC、更新成就全部解锁；Full 同时属于 Mythic。
- 按 Exophase 分组计算，未接入微软官方 Mythic 状态。分组缺失时不按积分推算；总成就已全部完成时可确认本体也已完成。
- 本体全成就以封面外侧的绿色边框、底部星芒与月桂 SVG 装饰表示，不再显示独立徽章。装饰与底边一体，封面没有额外底座；游戏封面优先原图，失败后降级，保持图片原始比例。
- 成就目录沿用已核验缓存；源站总成就数改变时停止使用旧目录，补充目录后重新核验。每日自动重新合并玩家解锁记录。
- 重复的成就明细在加密载荷内去重，解密后恢复完整快照；不删除历史记录。旧格式加密文件仍然可读，JSON 导出保持完整结构。

## 本地验证记录（2026-10-30）

- TypeScript 与生产构建通过，19 项 Node 测试通过；生产产物不含示例数据入口。
- 浏览器检查 390px 手机、1440px 桌面；搜索、排序、Mythic／Full 筛选、空结果、详情关闭与返回、长标题、CSV 导出正常，无横向溢出。
- 用真实 Exophase 公开成就页结构验证解析器：《赛博朋克 2077》44 个本体＋13 个往日之影，正式名称、描述、稀有度读取正确。
- 更新了 CI 页面检查脚本，但此次本地 HTTP 预览没有运行其完整真实加密登录／IndexedDB 自动解锁回归。加密、密码迁移、历史保留已在 Node 测试中验证。
- 尚未执行真实账号全量云端同步、推送或部署；新分组数据需后续首次成功同步后才能填入线上档案。

## 成就分组目录缓存

云端的 Exophase 游戏详情页返回机器人安全验证，因此同步任务不再重复访问这条受限路径。`data/achievement-catalogs.json` 仅保存公开的游戏成就目录；每日将它与新的玩家解锁编号、时间合并。只有编号与本体／追加分组完整对应、成就总数一致时才确认为已核验。

补充目录工具位于 `public/catalog-export.html`。用户在自己正常访问 Exophase 的电脑浏览器中运行书签工具，逐页读取公开目录；若遇到安全验证，由用户自行完成或跳过，不尝试自动处理。导出的 JSON 不含登录 Cookie、应用密码、浏览器存储或玩家解锁记录。

收到用户导出的文件后，执行 `node --experimental-strip-types scripts/import-catalogs.ts /absolute/path/export.json` 校验并合并；提交 `data/achievement-catalogs.json` 会触发同步。新增游戏或成就总数变化时，需要补充相应目录，原有解锁状态的更新仍然自动进行。

导出页面由 `node scripts/build-catalog-export.mjs` 生成，使用与同步程序相同的 DOM 解析器。CI 用完全拦截的本地样本响应测试书签、读取弹窗和 JSON 下载，不向 Exophase 发测试请求。


### 图片与成就排序

发布任务会把允许来源的公开封面与成就图转换为 WebP，随 GitHub Pages 同站分发。游戏列表使用 480px 封面、详情使用 1600px 封面，成就图上限 168px；保持原始比例且不放大小图。生成文件由 Actions 缓存复用，同一源图只下载一次；图片源失败时保留原地址回退，首次生成设有五分钟预算，后续发布继续补齐。图片文件名包含源地址及转换版本的摘要，避免新图误用旧缓存。

成就详情默认合并本体与追加内容，按解锁时间从新到旧显示；可切换时间升序、稀有度百分比升序或降序，也可单独选择分组。时间排序中无时间的已解锁条目与未解锁条目置后，稀有度缺失也始终置后。
