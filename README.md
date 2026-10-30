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
- 成就目录最多缓存七天；总成就数改变时立即重新读取。每日重新合并玩家解锁记录。
- 重复的成就明细在加密载荷内去重，解密后恢复完整快照；不删除历史记录。旧格式加密文件仍然可读，JSON 导出保持完整结构。

## 本地验证记录（2026-10-30）

- TypeScript 与生产构建通过，19 项 Node 测试通过；生产产物不含示例数据入口。
- 浏览器检查 390px 手机、1440px 桌面；搜索、排序、Mythic／Full 筛选、空结果、详情关闭与返回、长标题、CSV 导出正常，无横向溢出。
- 用真实 Exophase 公开成就页结构验证解析器：《赛博朋克 2077》44 个本体＋13 个往日之影，正式名称、描述、稀有度读取正确。
- 更新了 CI 页面检查脚本，但此次本地 HTTP 预览没有运行其完整真实加密登录／IndexedDB 自动解锁回归。加密、密码迁移、历史保留已在 Node 测试中验证。
- 尚未执行真实账号全量云端同步、推送或部署；新分组数据需后续首次成功同步后才能填入线上档案。
