# 免费 Cloudflare Cron 接管 Xbox 同步（不迁移网站）

目的：替换目前容易漏触发的 GitHub Actions `schedule`，**仍然由现有 GitHub Actions 抓取 Xbox、保管微软授权、加密快照并发布 GitHub Pages**。Cloudflare 只定时发送一次授权的 GitHub workflow_dispatch。**不要把 Token 发到聊天、Issue、仓库文件或截图里。**

## 当前准备状态

- 已实现可直接复制的纯 JS Worker：[`cloudflare-sync/scheduler.mjs`](../cloudflare-sync/scheduler.mjs)。
- `.github/workflows/sync.yml` 新增可选 `workflow_dispatch.inputs.force_sweep`。原来的 `request_id` 网页手动同步和 GitHub `schedule` 全部保留，互不冲突。
- 当前**未启用** Cloudflare 定时器；必须在 Cloudflare 控制台部署 Worker 后才开始工作。旧 GitHub Cron 在验收完成前保留，避免切换空窗。

## 你只需要在网页上操作

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

部署初始模板后进入 **Edit code**，用 [scheduler.mjs](../cloudflare-sync/scheduler.mjs) 文件的完整内容替换现有代码并 **Deploy**。

它只有 `scheduled()` 能发起同步；公开 `workers.dev` 地址只返回 HTTP 404，避免别人通过网页点击乱触发。

### 3. 存储访问凭据

在该 Worker 的 **Settings → Variables and Secrets → Add**：

- Type：**Secret**（不能选普通 Text）
- Name：`GITHUB_ACTIONS_TOKEN`
- Value：粘贴步骤 1 的 GitHub Token
- 点击 **Deploy** 保存

不用设置 `APP_PASSWORD`、微软密钥或其它 Xbox 凭据到 Cloudflare；它们继续只存在原有 GitHub 环境中。

### 4. 设置三个 Cron Triggers

Worker → **Settings → Triggers → Cron Triggers**，分别添加下面三条五字段表达式。**Cloudflare 使用 UTC，不能填北京时间**。

| Cron (UTC) | 北京时间 | 作用 |
|---|---|---|
| `17,47 0-14,16-23 * * *` | 通常每小时 17、47 分，23 点除外 | 普通约半小时同步 |
| `42 15 * * *` | 每天 23:42 | 当天临近结束时强制更新时长 |
| `2 16 * * *` | 每天 00:02 | 次日时长基线采样 |

这三条是**旧版已有规则的等价替换**，没有额外增加同步次数；Cloudflare Free 每个账户最多 5 个 Cron Triggers，容量够用。Cron 设置全球生效可能需要最多约 15 分钟。

### 5. 验证至少一次实际触发

在下一次预期时段查看：
- Cloudflare Worker 的 Observability / Logs：应出现 `Xbox sync dispatched`，且 HTTP 状态 200 或 204。
- GitHub [Actions 的 Sync Xbox records](https://github.com/sonder98/xbox-playlog-pages/actions/workflows/sync.yml)：应出现 `workflow_dispatch` 触发、最终 Success。
- [Deploy Playlog](https://github.com/sonder98/xbox-playlog-pages/actions/workflows/pages.yml) 应随后成功。

此阶段可容许旧 Github Cron 与 Cloudflare 有短暂重合，因为既有同步工作流拥有 concurrency group；但不应长期保持两个来源同时调度。

### 6. 新方案通过验收后，关闭旧 Cron

**只有实际验收成功后**，删除 `.github/workflows/sync.yml` 的 `on.schedule` 三条定义，**保留** `workflow_dispatch`、`push`、`inputs.force_sweep`，并保留原有同步与发布流程。

可直接告知后续开发 Agent：**「Cloudflare 的定时调用已验证成功，关闭 GitHub 的 schedule，保留工作流其他触发方式。」** 不需要取消 GitHub Actions 整个工作流。

## 排障

- Cloudflare 401/403：Token 失效、资源仓库选择错或未授予 Actions:write。
- Cloudflare 404：公开网站访问是设计行为，**不能**据此判断 Cron 失效；应看 Cron Logs。
- Cloudflare 成功，但 GitHub 未看到运行：检查 `workflow_dispatch` workflow 是否位于默认分支、Cloudflare 定时是否已经传播。
- GitHub 任务 Queued：触发已完成，随后排队运行和部署时间不属于 Cloudflare 定时器能保证的部分。
- GitHub 失败：继续看原有 `Sync Xbox records` Actions 日志；Cloudflare 本身不处理 Xbox API。
- 本项目的 `request_id` 手动同步和 GitHub Pages/PWA 地址均不受影响。

参考：[Cloudflare Cron](https://developers.cloudflare.com/workers/configuration/cron-triggers/)、[Cloudflare Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)、[GitHub workflow_dispatch API](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event)。
