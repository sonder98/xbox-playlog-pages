# 免费 Cloudflare Cron 接管 Xbox 同步（不迁移网站）

> **2026-11-07 已验证：** Cloudflare Worker 在北京时间 10:17 成功派发 Xbox 同步，GitHub [同步任务 #42328532687](https://github.com/sonder98/xbox-playlog-pages/actions/runs/42328532687) 和 [Pages 部署 #42329746858](https://github.com/sonder98/xbox-playlog-pages/actions/runs/42329746858) 均成功。现将调度升级为**每小时 :17 一次**；GitHub 原生定时器已从源码移除，但仍需在 Cloudflare 控制台更新 Worker 代码与 Cron，仓库合并不等于已部署。

目的：替换目前容易漏触发的 GitHub Actions `schedule`，**仍然由现有 GitHub Actions 抓取 Xbox、保管微软授权、加密快照并发布 GitHub Pages**。Cloudflare 只定时发送一次授权的 GitHub workflow_dispatch。**不要把 Token 发到聊天、Issue、仓库文件或截图里。**

## 当前状态

- 已实现可直接复制的纯 JS Worker：[`cloudflare-sync/scheduler.mjs`](../cloudflare-sync/scheduler.mjs)。
- `.github/workflows/sync.yml` 保留 `workflow_dispatch.inputs.force_sweep`、`request_id` 和 `push`，网页手动同步正常；GitHub 原有 `schedule` 已移除，避免双重调度。
- Cloudflare Worker 已经真实运行并经 GitHub 成功同步验证。**线上仍可能保留每两小时的旧规则**；必须部署最新版 Worker 并在 Cloudflare 控制台替换 Cron 才会升级为每小时一次。最新版 Worker 临时兼容旧两小时规则，避免过渡期失败。

## Cloudflare 网页设置与迁移

### 1. 生成一枚 GitHub Fine-grained Token

打开 https://github.com/settings/personal-access-tokens/new （登录相应 GitHub 账号）：

- Token name：`xbox-playlog-cloudflare-cron`
- Resource owner：`sonder98`
- Repository access：**Only select repositories** → `sonder98/xbox-playlog-pages`
- Repository permissions：**Actions: Read and write**；其余保持默认，无需 Contents 写权限
- Expiration：设置你能接受的有效期，并记得届时续签。Token 过期后 Cron 还会触发，但 GitHub 会返回 401/403。

生成后复制 Token，仅在 Cloudflare 控制台粘贴。不要交给助手、不要放在 GitHub 公开仓库或普通变量中。

### 2. 创建免费 Cloudflare Worker

打开 https://dash.cloudflare.com/ → **Workers & Pages** → **Create application**，创建一个普通 Worker（模板使用 Hello World / Start from scratch 即可），命名例如 `xbox-playlog-scheduler`。

进入 **Edit code**，用 [scheduler.mjs](../cloudflare-sync/scheduler.mjs) 的**最新版完整代码**替换现有 Worker 并 **Deploy**。 **2026-11-07 新增同步来源标识：**代码会向 GitHub 一并传入 `sync_mechanism`（`cloudflare` 或 `day-boundary`）。如果已部署旧版 Worker，**仅需重新 Deploy 新源码，无须修改三条 Cron 或重新设置令牌**。旧版 Worker 在更新前仍能正常同步，但新快照不会凭时间被猜测为自动同步，会暂显示「来源未记录」。已经创建 Worker 的用户无需再次创建；**先部署代码，再修改 Cron**，因为旧线上代码不接受新表达式。

它只有 `scheduled()` 能发起同步；公开 `workers.dev` 地址只返回 HTTP 404，避免别人通过网页点击乱触发。

### 3. 存储访问凭据

在该 Worker 的 **Settings → Variables and Secrets → Add**：

- Type：**Secret**（不能选普通 Text）
- Name：`GITHUB_ACTIONS_TOKEN`
- Value：粘贴步骤 1 的 GitHub Token
- 点击 **Deploy** 保存

不用设置 `APP_PASSWORD`、微软密钥或其它 Xbox 凭据到 Cloudflare；它们继续只存在原有 GitHub 环境中。

### 4. 将三条 Cron Triggers 改为每小时版

Worker → **Settings → Triggers → Cron Triggers**，分别添加下面三条五字段表达式。**Cloudflare 使用 UTC，不能填北京时间**。

| Cron (UTC) | 北京时间 | 作用 |
|---|---|---|
| `17 * * * *` | 每天每小时 :17（00:17、01:17、……23:17，允许平台延迟） | **每小时**普通同步 |
| `42 15 * * *` | 每天 23:42 | 当天临近结束时强制更新时长 |
| `2 16 * * *` | 每天 00:02 | 次日时长基线采样 |

Cloudflare 控制台需要**删除旧** `17 */2 * * *`，**添加新** `17 * * * *`；另外两条日界采样维持原样。最终总共应为 **3 条 Cron、每天 26 次触发**，不要同时保留新旧普通同步规则以免重复。Cloudflare Free 每个账户最多 5 个 Cron Triggers，容量够用。Cron 设置传播可能需要最多约 15 分钟。**编辑 / Deploy 之后刷新 Trigger events 页面，确认三条规则仍存在**；曾发生部署后触发器丢失。

### 5. 验证每小时规则实际触发

此前 10:17 的 Cloudflare 两小时版触发已成功通过完整链路；切换到新 Cron 后还要在下一次 **奇数小时的 :17**（如 11:17、13:17）核查，证明新增的每小时规则确实生效。查看（仅 Worker 调用成功不代表 Xbox 同步已完成）：
- Cloudflare Worker 的 Observability / Logs：应出现 `Xbox sync dispatched`，且 HTTP 状态 200 或 204。
- GitHub [Actions 的 Sync Xbox records](https://github.com/sonder98/xbox-playlog-pages/actions/workflows/sync.yml)：应出现 `workflow_dispatch` 触发、最终 Success。
- [Deploy Playlog](https://github.com/sonder98/xbox-playlog-pages/actions/workflows/pages.yml) 应随后成功。

注意新旧 Cloudflare 普通同步 Cron 不能长期并存；GitHub 的原生 schedule 已取消，不再需要双调度容错。

### 6. GitHub 原生定时器已关闭

GitHub 同步工作流已删除 `on.schedule`，但保留 `workflow_dispatch`、`push` 和 `inputs.force_sweep`。**不要关闭整个 GitHub Actions 工作流**；Cloudflare 通过 `workflow_dispatch` 运行它，网页「立即同步」也依赖它。初次合并后因为同步工作流文件变化可能额外触发一次 `push` 同步，这不是定时器重复。

## 排障

- Cloudflare 401/403：Token 失效、资源仓库选择错或未授予 Actions:write。
- Cloudflare 404：公开网站访问是设计行为，**不能**据此判断 Cron 失效；应看 Cron Logs。
- `Unexpected Cron Trigger`：只修改了控制台的 `17 * * * *`，却没有先部署最新 `scheduler.mjs`，需要重新部署 Worker 代码。
- Cloudflare 成功，但 GitHub 未看到运行：检查 `workflow_dispatch` workflow 是否位于默认分支、Cloudflare 定时是否已经传播。
- GitHub 任务 Queued：触发已完成，随后排队运行和部署时间不属于 Cloudflare 定时器能保证的部分。
- GitHub 失败：继续看原有 `Sync Xbox records` Actions 日志；Cloudflare 本身不处理 Xbox API。
- 本项目的 `request_id` 手动同步和 GitHub Pages/PWA 地址均不受影响。

参考：[Cloudflare Cron](https://developers.cloudflare.com/workers/configuration/cron-triggers/)、[Cloudflare Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)、[GitHub workflow_dispatch API](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event)。
