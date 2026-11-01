# XBOX Playlog：0 元 PWA 试运行

## 阶段一（已在主仓库实现，暂仍运行于 GitHub Pages）

- iPhone Safari 打开现有网站，分享 → 添加到主屏幕 → 作为网页 App 打开。
- 站点提供 Web App Manifest（standalone）、XBOX Playlog应用图标、iOS 启动图标。
- Service Worker 只缓存公开网页代码和有限的公开图片；**绝不缓存 vault.json / status.json**。查看最新 Xbox 记录仍需联网。
- Xbox 同步、解密、密码记住逻辑不变。新增依赖为零，现有 Sharp 在构建时生成 PNG 图标。

## 阶段二（用户注册免费托管账号后）

1. 先使用免费平台提供的 HTTPS 二级域名测试中国大陆手机不开 VPN 时的访问。**先测试，不能保证免费域名在国内长期可用。**
2. 外部主域名根路径部署时，Vite 构建设置环境变量 `PLAYLOG_BASE=/`；GitHub Pages 不设置此变量，继续使用 `/xbox-playlog-pages/`。
3. **不能仅在托管平台直接导入 GitHub 仓库就算迁移完成**：现有 Xbox 图片缓存位于 GitHub Actions 的 `public/media` 缓存中，并没有全部提交进 Git 仓库。新域名下的旧快照图像地址会自动重映射到新域名的 `/media/`，因此镜像部署时必须连同 Actions 恢复的 `public/media` 一起发布，否则可能出现大量空图。
4. 只有配置了与既有 GitHub Actions 同步任务衔接的镜像发布流程，才能保持现有半小时定时更新能力。
5. 所有新平台访问密钥应只保存在 GitHub Actions Secrets 中，**不要通过聊天粘贴、不要提交仓库**。

### 免费额度/访问限制（2026-11-01 核实）

- Netlify Free: 每月 300 积分，生产部署每次 15 积分，不适合每半小时重部署（每月约 1440 次）。可用于低频测试。
- Vercel Hobby: 每日最多 100 次部署，但默认 `.vercel.app` 在中国大陆经常无法访问；CLI 上传源文件合计不得超过 100 MB，现有公开图片缓存约 116 MB，直接复制整包部署可能失败。仅在实测可用并确定镜像方案后选择。
- Cloudflare Pages Free: 每月 500 次构建，约 16 次/天；默认 `.pages.dev` 在中国大陆部分地址遭阻断或不稳定。
- 免费域名在中国大陆的可用性存在网络地区差异，不能代替真实手机测试。

阶段二的账号创建和平台授权必须由用户亲自完成；当前未创建外部托管项目，网站仍部署于 GitHub Pages。
