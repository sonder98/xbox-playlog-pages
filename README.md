# 游迹 / GitHub Pages 展示版

静态网站从 Exophase 公开档案 `SondrRope` 读取 Xbox 游戏库和已解锁成就。GitHub Actions 每天自动同步，也会在更新同步脚本后执行一次；不需要 Xbox/Microsoft 应用、Xbox 登录令牌或 OpenXBL API Key。

## 唯一需要的 Secret

仓库 Settings → Secrets and variables → Actions 中保留 `APP_PASSWORD`，至少 16 位，用于加密同步历史。同步程序先用该密码解密旧快照，再把新快照加密保存，因此请使用原先设置的同一个密码。无需新建或填写 `XBOX_CLIENT_ID`、`XBOX_REFRESH_TOKEN`、`XBOX_CLIENT_SECRET` 或 `OPENXBL_API_KEY`。

## 数据与隐私

- 来源：Exophase 公共页面/API，玩家 ID `4285437`。
- `public/vault.json` 只存 AES-256-GCM 密文；网页在浏览器本机解密，密码不发送给网站。
- 公开 Exophase 成就接口目前可返回已解锁成就的图标和解锁时间；接口未返回稀有度，因此稀有度暂时为空。
- Exophase 若改变公共接口或限制访问，同步会失败并保留此前的加密记录。

## 功能

游戏库、游玩时长、成就数量/完成度、逐项已解锁成就、搜索筛选、快照对比、备份导入导出。GitHub Actions → Publish and sync Playlog 可手动重新运行；每日定时任务约在北京时间 08:17 运行。

## 开发

Node 22.13+，运行 `npm install`、`npm test`、`npm run build`。
