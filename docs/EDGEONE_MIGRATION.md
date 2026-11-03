# XBOX Playlog → EdgeOne Makers 迁移（预览阶段）

更新：2026-11-03。**GitHub Pages 仍是正式站点和回滚入口；EdgeOne 当前只部署预览，不切换公开网址。**

## 目标架构

- GitHub Actions 继续负责微软 Xbox 官方 API、加密、历史状态及公开 WebP 素材归档。
- 自动同步改为每 2 小时一次；额外保留北京时间 23:42 和 00:02 两次边界采样，准确衔接每日时长。网页手动同步仍触发原 sync.yml。
- 每轮同步仍先发布 GitHub Release playlog-live，随后在 EdgeOne Secrets 已配置时，把同一份 AES-GCM 加密快照镜像到 EdgeOne Blob。
- EdgeOne 网站只在预览/代码部署时构建。Xbox 数据更新只写 Blob，不触发 EdgeOne 构建。
- EdgeOne GET /api/vault Function 从 Blob 读取快照并流式返回；浏览器仍使用现有 APP_PASSWORD 在本地解密。API Token 永远不进入前端。
- public/media 从 GitHub Release 恢复后随静态站点部署，不把图片库当作 Blob 图床。
- GitHub Pages 现有部署与手动同步逻辑全部保留，直到用户在中国大陆网络实测通过并明确确认切换。

## Blob 结构与 25MB 单对象限制

当前 playlog-live/vault.json 约 32.1MB，超过 EdgeOne Blob 单对象 25MB 上限。scripts/edgeone-blob.mjs 将密文按 8MiB 分块，写入：

- vault/<version>/part-0000 等分块
- vault/manifest.json（最后写入，作为版本切换指针）

写完新块后才更新 manifest，随后保留上一完整版本，清理更早的旧块和失败残留。这样中途上传失败不会覆盖当前可用快照；存储常态约为两份快照（约 64MB），远低于 1GB 免费存储。Function 按 manifest 顺序流式返回完整 JSON，不把 32MB 文件塞进单个 Blob。

## 需要用户在腾讯云控制台做一次的事

1. 登录腾讯云控制台并开通 EdgeOne Makers。
2. 创建新项目，建议名称 **xbox-playlog**，创建方式选择 **「直接上传」**（我们通过 GitHub Actions 的 EdgeOne CLI 上传已构建产物，不使用 Makers Git 自动构建）。上传一个临时 index.html 即可完成项目创建；之后 CLI 会覆盖部署内容。
3. 为了测试大陆网络，选择中国站控制台，并在项目加速区域选择包含中国大陆的区域。暂时不配置自定义域名。
4. 在项目概览复制 **Project ID**。
5. Makers 控制台切换到 **API Token**，创建一个用于 GitHub Actions 的 Token，建议设置可接受的最长有效期（最长 1 年），保存好，不要发送到聊天或 Issue。
6. GitHub 仓库 sonder98/xbox-playlog-pages → **Settings → Secrets and variables → Actions → New repository secret**，添加：
   - EDGEONE_API_TOKEN：刚创建的 Makers API Token
   - EDGEONE_PROJECT_ID：项目 ID（非密码，但作为 Secret 保存更省事）

只需要告诉开发者「EdgeOne 项目已创建，两个 GitHub Secrets 已添加」，**不要把 Token 发给任何人或粘贴到聊天**。

## 部署预览

用户完成上述配置后，在 GitHub 仓库：

1. 打开 **Actions → Deploy XBOX Playlog to EdgeOne preview**。
2. 点击 **Run workflow**。
3. 等待任务成功，查看日志末尾的 EdgeOne Preview URL。
4. 在中国大陆手机网络（关闭 VPN）打开预览链接，验证：
   - 页面、登录框及 PWA 图标正常；
   - status.json 与 /api/vault 返回成功；
   - 输入原有 APP_PASSWORD 能解密；
   - 游戏封面、成就图片均正常；
   - 游戏详情、成就筛选、热力图、每日时长、手动同步入口正常。
5. 预览链接发给开发者即可协助排查；链接不是凭据，但有效期有限。

## 大陆访问与域名限制（重要）

腾讯云官方规则：Makers 项目域名/部署域名在中国大陆网络环境下需要使用控制台生成的**预览链接**，有效期 **3 小时**，过期会返回 401；可通过项目概览的「预览」按钮重新生成。

因此，没有已备案自定义域名时，可以免费验证大陆访问，但不能把 3 小时预览链接当作长期固定入口。长期稳定大陆直连需要自定义域名，并按所选加速区域完成 ICP 备案。全球可用区（不含中国大陆）虽可免备案，但不能满足大陆直连目标。

官方说明：
- 域名规则：https://pages.edgeone.ai/zh/document/domain-overview
- ICP 备案要求：https://cloud.tencent.com/document/faq/1552/110835
- Blob API：https://pages.edgeone.ai/zh/document/blob-storage
- CLI CI 部署：https://pages.edgeone.ai/zh/document/edgeone-cli

## 免费额度与同步频率

按 2026-11-03 可见官方配额：
- Blob 存储 1GB；单对象 25MB。
- 静态项目总存储 5GB、最多 20,000 文件、单文件 25MB；当前约 6,499 个 WebP 媒体文件，需在预览部署时检查实际总量。
- Edge Functions 每月 300 万次执行、CPU Time 300 万 ms。
- Makers 公告预计 2026-11-09 至 11-11 调整：构建由 500 次/月改为 300 分钟/月；Cloud Functions 内存时长调整为 5 万 GB-s/月。本项目读取接口用 Edge Functions，不使用 Cloud Functions。
- 数据同步不触发 EdgeOne 构建；仅手动预览或前端代码发布才构建。
- 自动同步 cron：17 */2 * * *（每两小时），并保留 42 15 * * *（北京时间 23:42）和 2 16 * * *（北京时间 00:02）两次时长边界采样。即 12 次常规同步 + 2 次日界采样/天；手动同步另计。

## 回滚与切换原则

- 绝不删除 GitHub Release、GitHub Pages 或原有 GitHub Actions 发布链路。
- EdgeOne Blob 写入是可选镜像步骤；缺少 Secrets 时跳过，写入失败时不阻断 GitHub Release 和 Pages 正式发布。
- EdgeOne Preview 验收通过后，仍需用户确认是否进入正式部署。只有解决稳定域名/ICP备案后，才考虑将 EdgeOne 设为长期入口。
