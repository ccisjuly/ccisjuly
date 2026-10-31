// 网关核心：每一次 Agent 调用都经过 身份 → 资产范围 → 操作权限 → 广告护栏 → 审批 的检查链，
// 并写入审计日志。放行的变更会记录变更前后快照，用于一键回滚。

const ROLE_RANK = { analyst: 1, operator: 2, manager: 3 };
const ROLE_LABEL = { analyst: '分析师（只读）', operator: '优化师（调价/开关）', manager: '管理员（新建/删除）' };

const TOOLS = [
  {
    name: 'list_accounts', title: '列出可访问的广告账户', minRole: 'analyst', write: false,
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_campaigns', title: '列出账户下的广告系列', minRole: 'analyst', write: false,
    inputSchema: { type: 'object', properties: { account_id: { type: 'string' } }, required: ['account_id'] },
  },
  {
    name: 'get_report', title: '查看账户今日报表', minRole: 'analyst', write: false,
    inputSchema: { type: 'object', properties: { account_id: { type: 'string' } }, required: ['account_id'] },
  },
  {
    name: 'update_budget', title: '修改广告系列日预算', minRole: 'operator', write: true,
    inputSchema: {
      type: 'object',
      properties: { campaign_id: { type: 'string' }, daily_budget: { type: 'number', description: '新的日预算（美元）' } },
      required: ['campaign_id', 'daily_budget'],
    },
  },
  {
    name: 'pause_campaign', title: '暂停广告系列', minRole: 'operator', write: true,
    inputSchema: { type: 'object', properties: { campaign_id: { type: 'string' } }, required: ['campaign_id'] },
  },
  {
    name: 'resume_campaign', title: '开启广告系列', minRole: 'operator', write: true,
    inputSchema: { type: 'object', properties: { campaign_id: { type: 'string' } }, required: ['campaign_id'] },
  },
  {
    name: 'create_campaign', title: '新建广告系列', minRole: 'manager', write: true,
    inputSchema: {
      type: 'object',
      properties: { account_id: { type: 'string' }, name: { type: 'string' }, daily_budget: { type: 'number' } },
      required: ['account_id', 'name', 'daily_budget'],
    },
  },
  {
    name: 'delete_campaign', title: '删除广告系列', minRole: 'manager', write: true,
    inputSchema: { type: 'object', properties: { campaign_id: { type: 'string' } }, required: ['campaign_id'] },
  },
];

const usd = (n) => '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });

class Gateway {
  constructor(state) {
    this.state = state;
  }

  find(list, id) {
    return this.state[list].find((x) => x.id === id);
  }

  orgName(id) {
    return this.find('orgs', id)?.name || id;
  }

  // 有效权限 = Agent 自身角色 ∩ 品牌方授予其所属组织的角色（自家账户则不受授权限制）
  effectiveRole(agent, account) {
    if (agent.orgId === account.ownerOrg) return { role: agent.role, via: 'owner' };
    const grant = this.state.grants.find((g) => g.accountId === account.id && g.toOrg === agent.orgId);
    if (!grant || !grant.role) return { role: null, via: 'none' };
    const role = ROLE_RANK[grant.role] < ROLE_RANK[agent.role] ? grant.role : agent.role;
    return { role, via: 'grant', grantRole: grant.role };
  }

  // tools/list 只返回 Agent 在任一账户上有权使用的工具
  visibleTools(agent) {
    if (!agent || agent.status !== 'active') return [];
    let max = 0;
    for (const accId of agent.accounts) {
      const acc = this.find('accounts', accId);
      const eff = acc && this.effectiveRole(agent, acc);
      if (eff?.role) max = Math.max(max, ROLE_RANK[eff.role]);
    }
    return TOOLS.filter((t) => ROLE_RANK[t.minRole] <= max);
  }

  activeBudgetSum(accountId) {
    return this.state.campaigns
      .filter((c) => c.accountId === accountId && c.status === 'ACTIVE')
      .reduce((s, c) => s + c.dailyBudget, 0);
  }

  describe(tool, args) {
    const c = args.campaign_id && this.find('campaigns', args.campaign_id);
    const a = args.account_id && this.find('accounts', args.account_id);
    const cn = c ? `「${c.name}」` : `「${args.campaign_id}」`;
    const an = a ? `「${a.name}」` : `「${args.account_id}」`;
    switch (tool) {
      case 'list_accounts': return '列出可访问的广告账户';
      case 'list_campaigns': return `查看${an}的广告系列`;
      case 'get_report': return `查看${an}的今日报表`;
      case 'update_budget': return `将${cn}日预算 ${c ? usd(c.dailyBudget) : '?'} → ${usd(args.daily_budget)}`;
      case 'pause_campaign': return `暂停${cn}`;
      case 'resume_campaign': return `开启${cn}`;
      case 'create_campaign': return `在${an}新建广告系列「${args.name}」，日预算 ${usd(args.daily_budget)}`;
      case 'delete_campaign': return `删除${cn}`;
      default: return `${tool} ${JSON.stringify(args)}`;
    }
  }

  handle({ token, tool, args = {}, via = 'console' }) {
    const st = this.state;
    const checks = [];
    const ctx = { savedUsd: 0 };
    const description = this.describe(tool, args);
    const agent = st.agents.find((a) => a.token === token);
    let account = null;

    const pass = (name, detail) => checks.push({ name, status: 'pass', detail });
    const review = (name, detail) => checks.push({ name, status: 'review', detail });
    const fail = (name, detail) => {
      checks.push({ name, status: 'fail', detail });
      return this.record({ agent, tool, args, via, checks, decision: 'denied', account, description, savedUsd: ctx.savedUsd });
    };

    // 1. 身份
    if (!agent) return fail('身份认证', 'token 无效，请求被拒绝');
    if (agent.status !== 'active') return fail('身份认证', `${agent.name} 已被停用（Kill Switch）`);
    pass('身份认证', `${agent.name} · ${this.orgName(agent.orgId)} · 负责人 ${agent.sponsor}`);

    const def = TOOLS.find((t) => t.name === tool);
    if (!def) return fail('工具识别', `未知工具 ${tool}`);

    // 2. 定位目标对象
    let campaign = null;
    if (args.campaign_id) {
      campaign = this.find('campaigns', args.campaign_id);
      if (!campaign) return fail('目标对象', `广告系列 ${args.campaign_id} 不存在`);
      account = this.find('accounts', campaign.accountId);
    } else if (args.account_id) {
      account = this.find('accounts', args.account_id);
      if (!account) return fail('目标对象', `广告账户 ${args.account_id} 不存在`);
    } else if (tool !== 'list_accounts') {
      return fail('参数校验', '缺少 account_id 或 campaign_id');
    }

    // 3. 资产范围 + 操作权限
    if (account) {
      if (!agent.accounts.includes(account.id)) {
        return fail('资产范围', `该 Agent 未被分配账户「${account.name}」`);
      }
      const eff = this.effectiveRole(agent, account);
      if (!eff.role) {
        return fail('资产范围', `「${this.orgName(agent.orgId)}」未获得品牌方「${this.orgName(account.ownerOrg)}」对「${account.name}」的授权`);
      }
      pass('资产范围', eff.via === 'owner'
        ? `自有账户「${account.name}」`
        : `品牌方「${this.orgName(account.ownerOrg)}」已授权「${this.orgName(agent.orgId)}」：${ROLE_LABEL[eff.grantRole]}`);

      if (ROLE_RANK[eff.role] < ROLE_RANK[def.minRole]) {
        const why = eff.via === 'grant' && ROLE_RANK[eff.grantRole] < ROLE_RANK[agent.role]
          ? `（Agent 角色是「${ROLE_LABEL[agent.role]}」，但品牌方只授予了「${ROLE_LABEL[eff.grantRole]}」）`
          : '';
        return fail('操作权限', `有效角色「${ROLE_LABEL[eff.role]}」不能执行「${def.title}」，需要「${ROLE_LABEL[def.minRole]}」${why}`);
      }
      pass('操作权限', `有效角色「${ROLE_LABEL[eff.role]}」可执行「${def.title}」`);
    } else {
      pass('操作权限', '只读操作');
    }

    if (!def.write) {
      const result = this.executeRead(agent, tool, account);
      return this.record({ agent, tool, args, via, checks, decision: 'allowed', account, description, result });
    }

    // 4. 广告护栏
    const p = st.policies[account.id];
    if (campaign) {
      if (campaign.status === 'DELETED') return fail('目标对象', `「${campaign.name}」已删除`);
      const hit = campaign.tags.filter((t) => p.protectedTags.includes(t));
      if (hit.length) return fail('受保护对象', `「${campaign.name}」带有受保护标签 [${hit.join(', ')}]，禁止 Agent 修改`);
      pass('受保护对象', '目标不在保护名单内');
    }

    if (tool === 'delete_campaign' && p.forbidDelete) {
      return fail('禁止删除', '账户策略禁止 Agent 删除广告系列（误删无法恢复），请改用暂停');
    }

    const hourAgo = Date.now() - 3600e3;
    const recent = st.audit.filter((e) => e.agentId === agent.id && e.write && e.ts > hourAgo
      && ['allowed', 'pending', 'approved'].includes(e.decision)).length;
    if (recent >= p.maxChangesPerHour) {
      return fail('频率限制', `近 1 小时已变更 ${recent} 次，达到上限 ${p.maxChangesPerHour} 次`);
    }
    pass('频率限制', `近 1 小时变更 ${recent}/${p.maxChangesPerHour} 次`);

    const approvalReasons = [];
    let newBudget = 0;
    if (tool === 'update_budget' || tool === 'create_campaign') {
      newBudget = Number(args.daily_budget);
      if (!(newBudget > 0)) return fail('参数校验', 'daily_budget 必须是正数');
    }
    if (tool === 'create_campaign' && !args.name) return fail('参数校验', '缺少广告系列名称');

    if (tool === 'update_budget') {
      const old = campaign.dailyBudget;
      if (newBudget > old) {
        const pct = ((newBudget - old) / old) * 100;
        if (pct > p.maxIncreasePct) {
          ctx.savedUsd = newBudget - old;
          return fail('单次涨幅', `${usd(old)} → ${usd(newBudget)}，涨幅 ${pct.toFixed(0)}%，超过上限 ${p.maxIncreasePct}%（疑似误操作）`);
        }
        pass('单次涨幅', `涨幅 ${pct.toFixed(1)}%，上限 ${p.maxIncreasePct}%`);
        if (newBudget - old > p.approvalAboveUsd) {
          approvalReasons.push(`单次加预算 ${usd(newBudget - old)}，超过审批阈值 ${usd(p.approvalAboveUsd)}`);
        }
      } else {
        pass('单次涨幅', '降低或不变预算，无需限制');
      }
    }

    if (['update_budget', 'create_campaign', 'resume_campaign'].includes(tool)) {
      const current = this.activeBudgetSum(account.id);
      let projected = current;
      if (tool === 'update_budget' && campaign.status === 'ACTIVE') projected = current - campaign.dailyBudget + newBudget;
      if (tool === 'create_campaign') projected = current + newBudget;
      if (tool === 'resume_campaign' && campaign.status !== 'ACTIVE') projected = current + campaign.dailyBudget;
      if (projected > p.accountDailyCap) {
        ctx.savedUsd = projected - current;
        return fail('账户日预算上限', `执行后账户活跃日预算合计 ${usd(projected)}，超过上限 ${usd(p.accountDailyCap)}`);
      }
      pass('账户日预算上限', `执行后合计 ${usd(projected)} / 上限 ${usd(p.accountDailyCap)}`);
    }

    if (tool === 'create_campaign' && p.requireApprovalForCreate) approvalReasons.push('账户策略要求新建广告系列需人工审批');

    // 5. 审批
    if (approvalReasons.length) {
      review('人工审批', approvalReasons.join('；'));
      const entry = this.record({ agent, tool, args, via, checks, decision: 'pending', account, description });
      const approval = {
        id: ++st.seq.approval, auditId: entry.id, ts: Date.now(), agentId: agent.id, agentName: agent.name,
        tool, args, description, reason: approvalReasons.join('；'), accountId: account.id, status: 'pending',
      };
      st.approvals.unshift(approval);
      entry.approvalId = approval.id;
      return entry;
    }
    pass('人工审批', '未触发审批条件，自动放行');

    const change = this.executeWrite(tool, args, campaign, account);
    return this.record({ agent, tool, args, via, checks, decision: 'allowed', account, description, ...change });
  }

  executeRead(agent, tool, account) {
    if (tool === 'list_accounts') {
      return this.state.accounts
        .filter((a) => agent.accounts.includes(a.id))
        .map((a) => ({ id: a.id, name: a.name, platform: a.platform, role: this.effectiveRole(agent, a).role }))
        .filter((a) => a.role);
    }
    const cs = this.state.campaigns.filter((c) => c.accountId === account.id && c.status !== 'DELETED');
    if (tool === 'list_campaigns') {
      return cs.map((c) => ({ id: c.id, name: c.name, status: c.status, daily_budget: c.dailyBudget, tags: c.tags }));
    }
    if (tool === 'get_report') {
      return cs.map((c) => {
        const seed = [...c.id].reduce((s, ch) => s + ch.charCodeAt(0), 0);
        const spend = c.status === 'ACTIVE' ? Math.round(c.dailyBudget * (0.35 + (seed % 40) / 100)) : 0;
        return { id: c.id, name: c.name, spend_today: spend, roas: +(1.2 + (seed % 25) / 10).toFixed(2) };
      });
    }
    return null;
  }

  executeWrite(tool, args, campaign, account) {
    const snap = (c) => (c ? { status: c.status, dailyBudget: c.dailyBudget } : null);
    if (tool === 'create_campaign') {
      const c = {
        id: 'cmp_' + ++this.state.seq.campaign, accountId: account.id, name: args.name,
        tags: [], status: 'ACTIVE', dailyBudget: Number(args.daily_budget),
      };
      this.state.campaigns.push(c);
      return { before: null, after: snap(c), targetId: c.id, result: { created: c.id } };
    }
    const before = snap(campaign);
    if (tool === 'update_budget') campaign.dailyBudget = Number(args.daily_budget);
    if (tool === 'pause_campaign') campaign.status = 'PAUSED';
    if (tool === 'resume_campaign') campaign.status = 'ACTIVE';
    if (tool === 'delete_campaign') campaign.status = 'DELETED';
    return { before, after: snap(campaign), targetId: campaign.id, result: { id: campaign.id, ...snap(campaign) } };
  }

  record({ agent, tool, args, via, checks, decision, account, description, result, before, after, targetId, savedUsd }) {
    const st = this.state;
    const entry = {
      id: ++st.seq.audit, ts: Date.now(), via,
      agentId: agent?.id || null, agentName: agent?.name || '未知调用方',
      orgName: agent ? this.orgName(agent.orgId) : '-',
      tool, args, write: !!TOOLS.find((t) => t.name === tool)?.write,
      accountId: account?.id || null, platform: account?.platform || null,
      description, decision, checks, result: result ?? null,
      before: before ?? null, after: after ?? null, targetId: targetId ?? null,
      savedUsd: savedUsd || 0, rolledBack: false,
    };
    st.audit.unshift(entry);
    if (st.audit.length > 500) st.audit.length = 500;
    return entry;
  }

  decideApproval(id, approve, by = '王敏（投放主管）') {
    const st = this.state;
    const ap = st.approvals.find((a) => a.id === id);
    if (!ap || ap.status !== 'pending') throw new Error('审批单不存在或已处理');
    const entry = st.audit.find((e) => e.id === ap.auditId);
    ap.status = approve ? 'approved' : 'rejected';
    ap.decidedBy = by;
    ap.decidedAt = Date.now();
    if (!approve) {
      if (entry) {
        entry.decision = 'rejected';
        entry.checks.push({ name: '人工审批', status: 'fail', detail: `${by} 已驳回` });
      }
      return ap;
    }
    const campaign = ap.args.campaign_id && this.find('campaigns', ap.args.campaign_id);
    const account = this.find('accounts', ap.accountId);
    const change = this.executeWrite(ap.tool, ap.args, campaign, account);
    if (entry) {
      Object.assign(entry, change, { decision: 'approved' });
      entry.checks.push({ name: '人工审批', status: 'pass', detail: `${by} 已批准，网关已执行` });
    }
    return ap;
  }

  rollback(auditId, by = '王敏（投放主管）') {
    const st = this.state;
    const e = st.audit.find((x) => x.id === auditId);
    if (!e || !e.after || e.rolledBack) throw new Error('该记录无法回滚');
    const c = this.find('campaigns', e.targetId);
    if (!c) throw new Error('目标广告系列不存在');
    if (e.before) Object.assign(c, e.before);
    else c.status = 'DELETED'; // 回滚新建 = 下线该广告系列
    e.rolledBack = true;
    st.audit.unshift({
      id: ++st.seq.audit, ts: Date.now(), via: 'console', agentId: null, agentName: by, orgName: '人工操作',
      tool: 'rollback', args: { audit_id: auditId }, write: false, accountId: e.accountId, platform: e.platform,
      description: `回滚 #${auditId}：${e.description}`, decision: 'allowed', checks: [], result: null,
      before: null, after: null, targetId: c.id, savedUsd: 0, rolledBack: false,
    });
  }

  stats() {
    const a = this.state.audit.filter((e) => e.tool !== 'rollback');
    const count = (...d) => a.filter((e) => d.includes(e.decision)).length;
    return {
      total: a.length,
      allowed: count('allowed', 'approved'),
      denied: count('denied'),
      pending: this.state.approvals.filter((x) => x.status === 'pending').length,
      savedUsd: a.reduce((s, e) => s + (e.savedUsd || 0), 0),
      activeAgents: this.state.agents.filter((x) => x.status === 'active').length,
      accounts: this.state.accounts.length,
    };
  }
}

module.exports = { Gateway, TOOLS, ROLE_RANK, ROLE_LABEL };
