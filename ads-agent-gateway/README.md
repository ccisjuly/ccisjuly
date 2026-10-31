# 广告 Agent 管控网关 · 本地演示原型

放在 AI Agent 和 Meta / TikTok 广告平台之间的管控网关：每一次改预算、开关广告、新建、删除，都先过**权限**、**预算护栏**和**人工审批**，全程留痕，改错了可以**一键回滚**。

> 所有公司、账户、人名和数据都是虚构的；广告平台是内存里模拟出来的，不会调用真实 API。

## 运行

只需要 Node.js 18 及以上版本，没有任何依赖：

```bash
cd ads-agent-gateway
node server.js        # 或 npm start
```

- 管理后台：http://localhost:8787
- MCP 接入点：http://localhost:8787/mcp

换端口：`PORT=3000 node server.js`

## 主要满足的需求

| # | 需求 | 演示里在哪看 |
|---|---|---|
| 1 | **防止 Agent 乱花钱**：单次涨幅上限、账户日预算总上限、每小时变更次数上限 | 规则护栏、首页场景 |
| 2 | **高风险操作有人把关**：超过阈值自动转人工审批，批准后由网关执行 | 审批中心 |
| 3 | **品牌方 × 代理商多方授权**：沿用 Business Center 的思路，有效权限 = Agent 角色 ∩ 品牌授予代理商的角色 | 组织与授权 |
| 4 | **跨平台一套规则**：Meta / TikTok 统一管理 | 广告账户 |
| 5 | **说得清、改得回**：完整检查链 + 变更快照，一键回滚、一键停用 Agent | 审计日志 |
| 6 | **平台凭证不交给 Agent**：Agent 只拿网关 token，工具列表按权限过滤 | MCP 接入 |

## 页面

- **首页**：产品定位、主要需求、架构示意、10 个一键运行的典型场景
- **Agent 模拟器**：以任一 Agent 身份调用任一工具，查看网关逐步检查的结果
- **审批中心**：批准或驳回超过阈值的变更
- **审计日志**：所有调用记录、检查链、变更前后对比、一键回滚
- **组织与授权**：品牌方对代理商的资产授权、Agent 身份与 Kill Switch、有效权限矩阵
- **规则护栏**：按账户配置护栏，保存后立即生效
- **广告账户**：模拟的广告账户和广告系列的实时状态
- **MCP 接入**：每个 Agent 的 token、可见工具，以及接入 Claude Code 的命令

## 网关检查链

```
身份认证 → 目标对象 → 资产范围 → 操作权限 → 受保护对象 → 禁止删除
        → 频率限制 → 单次涨幅 → 账户日预算上限 → 人工审批 → 执行并写审计
```

任何一步失败都会直接拦截；触发审批条件时生成审批单，不会执行变更。

## 接入真实 Agent（可选）

服务端实现了一个最小的 MCP 接入点（Streamable HTTP，返回 JSON），支持 `initialize`、`tools/list`、`tools/call`：

```bash
claude mcp add --transport http ads-gateway http://localhost:8787/mcp \
  --header "Authorization: Bearer agt_tok_optimizer_7f3a"
```

接入后让 Claude「把冲锋衣-再营销的预算改成 12 万」，就能看到网关拦截这次调用，审计日志也会同步记录。

## 代码结构

```
server.js                HTTP 服务：静态页面、管理 API、MCP 接入点
src/store.js             演示数据（组织、账户、广告系列、授权、Agent、护栏）
src/gateway.js           网关核心：权限计算、护栏检查、审批、审计、回滚
src/api.js               管理 API 路由（服务端和在线预览版共用）
public/                  管理后台前端（原生 JS，无构建步骤）
scripts/build-static.js  生成单文件在线预览版 dist/preview.html
screenshots/             各页面截图
```

## 单文件预览版

不想启动服务时，可以生成一个单文件版本，网关逻辑直接在浏览器里运行，双击就能打开（不含 MCP 接入点）：

```bash
node scripts/build-static.js   # 生成 dist/preview.html
```

数据保存在内存里，重启服务或点击「重置演示数据」就会恢复初始状态。
