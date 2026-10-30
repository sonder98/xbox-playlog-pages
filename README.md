# 游迹 / GitHub Pages 展示版

这是公开展示仓库，原完整后端源码仓库 `sonder98/xbox-playlog` 保持私有。当前版本全部通过 GitHub Pages 和 GitHub Actions 工作，不再连接 Cloudflare。

## 首次配置

在本仓库 Settings → Secrets and variables → Actions → New repository secret 添加：

| Name | Secret |
| --- | --- |
| `APP_PASSWORD` | 自己设置的至少16位强密码，可与原应用访问密码相同；不要使用微软/GitHub登录密码 |
| `OPENXBL_API_KEY` | 在 https://xbl.io 获取的本人 API Key |

两个值分别添加，不是JSON。Secrets 不会从原私有仓库自动继承。不要把密钥发到聊天或提交到文件。

然后打开 Actions → Publish and sync Playlog → Run workflow，勾选同步 Xbox 数据并运行。流程会读取自己的账号、游戏列表、累计时长和成就进度，加密快照、提交密文并发布网页。首次代码推送只发布配置引导页，不会生成虚构游戏数据。

GitHub Pages 设置应选择 Source: GitHub Actions。正式网址以部署结果为准。

## 隐私与数据

- `public/vault.json` 只包含 AES-256-GCM 密文、随机盐、随机IV、算法及版本字段。玩家名称、XUID、游戏和历史快照均在密文内部。
- 密钥由应用密码通过 PBKDF2-SHA256（600000次）派生。每次同步使用新的盐和IV。浏览器本机解密，密码不发送给网页服务器。
- 页面和密文公开，数据长度、提交时间、提交次数及流量元信息可见。强密码很重要；加密不代表防止所有攻击。
- 不要突然更换 APP_PASSWORD：历史密文需要旧密码解密，错密码时同步会停止，不覆盖历史。若要换密码，应先解密备份并安排重新加密；本版本尚未提供一键换密。
- API Key 只提供给 Actions 同步步骤，不进入前端。同步日志不输出玩家身份或游戏名称。
- 导出的 JSON/CSV 是明文，仅供本人备份；本机导入记录以相同密码加密保存到浏览器，不能跨设备自动同步，也不会覆盖远程快照。
- 协作权限仅授予可信的人。能修改同步工作流的人可能获取运行时 Secrets；不要给陌生人写权限。

## 功能与边界

保留游戏库、累计时长、成就数量与完成度、快照对比、搜索筛选、备份导入导出。点击同步会打开 GitHub Actions；任务完成后刷新本站解锁。当前不做定时任务。

静态版暂不提供逐项成就实时查询。时长仅识别 MinutesPlayed；缺失时长不是零；新游戏首次出现不算区间新增；无法反推过去每天的场次。

## 开发验证

Node 22.13+，`npm install`、`npm test`、`npm run build`。测试涵盖加密往返、随机化、错误密码、篡改密文、异常工作因子、快照基线及整个采集加密流程（使用模拟接口）。真实 Xbox 数据仍需配置本人 API Key 后联调。
