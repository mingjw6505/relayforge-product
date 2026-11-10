export const stageNames = {discovery:'探索', clarifying:'澄清', prd:'PRD', prototype:'原型', spec:'规格', completed:'完成'};
export const modeNames = {standard:'标准模式', fast:'快速模式'};
export const artifactNames = {boundary:'需求边界', decision:'产品决定', prd:'PRD', prototype:'原型', spec:'规格'};
export const artifactStatusNames = {draft:'草稿', 'ready-for-review':'待评审 · 未批准', approved:'已批准', 'needs-review':'需复核 · 原审批不可沿用', missing:'文件缺失', 'in-progress':'编写中', done:'已产出 · 未批准', unknown:'未记录'};
const statusNames = {running:'进行中', waiting:'等待中', completed:'已完成', blocked:'受阻', cancelled:'已取消'};
const readinessNames = {problem:'问题',user:'用户',goal:'目标',scope:'范围',non_goals:'非目标',success_signal:'成功信号'};
const readinessValues = {present:'已具备',assumed:'待确认假设',missing:'缺失',unknown:'未记录'};

const useViaNames = {direct_read: '直接读取', skill_tool: 'Skill 工具', context: '宿主提供说明'};
const qualifiedSkill = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}:[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

function declaredUses(value) {
  return (Array.isArray(value) ? value : []).filter(item => item?.source === 'agent_declared'
    && typeof item.skill === 'string' && qualifiedSkill.test(item.skill)
    && Object.hasOwn(useViaNames, item.via) && typeof item.recorded_at === 'string'
    && Number.isFinite(Date.parse(item.recorded_at)));
}

/** Names merge by namespace; each evidence source keeps its own meaning. */
function skillRecords(receipts, uses) {
  const entries = new Map();
  function add(id, record) {
    if (!entries.has(id)) entries.set(id, {id, shortName: id.split(':')[1], records: []});
    const entry = entries.get(id);
    if (!entry.records.some(value => value.source === record.source && value.via === record.via)) {
      entry.records.push(record);
    }
  }
  for (const receipt of receipts) add(`relayforge-product:${receipt.name}`, {
    source: 'mcp_skill_load', label: '工具读取', at: receipt.loaded_at, digest: receipt.sha256,
  });
  for (const use of uses) add(use.skill, {
    source: 'agent_declared', via: use.via, label: `${useViaNames[use.via]} · Agent 申报`, at: use.recorded_at,
  });
  const values = [...entries.values()];
  const counts = new Map();
  for (const item of values) counts.set(item.shortName, (counts.get(item.shortName) ?? 0) + 1);
  return values.map(item => ({...item, name: counts.get(item.shortName) > 1 ? item.id : item.shortName}));
}

export function cardView(snapshot) {
  const details = snapshot.details ?? {};
  const product = snapshot.product ?? {};
  const available = snapshot.source_state?.status === 'available';
  const artifacts = product.artifacts ?? [];
  const stage = product.observed_stage ?? product.current_stage;
  const currentArtifact = artifacts.find(a => a.kind === stage) ?? (stage === 'completed' ? artifacts.find(a => a.kind === 'spec') : null);
  const receipts = (snapshot.skill_loads ?? []).filter(r => r?.source === 'mcp_skill_load' && ['workflow','skill'].includes(r.kind) && typeof r.name === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(r.name) && /^[a-f0-9]{64}$/.test(r.sha256));
  let status = statusNames[snapshot.status] ?? '未记录';
  let currentLabel = '当前';
  let current = details.current || snapshot.steps.find(s => s.status === 'active')?.label || '等待阶段申报';
  let remaining = details.remaining || '下一步尚未申报';
  const request = available && product.integrity?.status === 'valid' ? snapshot.confirmation_request : null;
  const attention = [];
  if (!available) attention.push(snapshot.source_state?.status === 'migration_required' ? '工作流记录需要迁移，审批状态尚未核对。' : '产品状态读取不可用；下列为上次记录，审批当前有效性未核对。');
  if (product.integrity?.status === 'invalid') attention.push(`${product.integrity.affected?.length ?? 0} 项产物需复核，原审批不可沿用。`);
  if (snapshot.confirmation_invalidated) attention.push('原确认目标已变化，请重新核对版本与范围。');
  if (snapshot.status === 'waiting') {
    currentLabel = '等待';
    status = details.waiting_for === 'user' ? request ? '等待你确认' : '等待你的补充' : details.waiting_for === 'external' ? '等待外部资料' : '等待中';
    current = details.reason || details.current || '等待原因尚未申报';
  }
  if (request) attention.push(`当前确认：${artifactNames[request.target_kind] || request.target_kind} ${request.version}（${request.scope_summary}）`);
  if (snapshot.confirmation_invalidated || (snapshot.confirmation_request && !request)) {
    status = '确认目标需核对';
    currentLabel = '当前';
    current = available ? '产物版本或审批条件已变化，需重新发起确认。' : '源状态不可用，原确认请求暂不可用。';
    remaining = '重新核对工作流记录后再发起确认。';
  }
  if (product.workflow_mode === 'fast' && stage === 'spec' && artifacts.some(a => ['prd','prototype'].includes(a.kind) && a.effective_status !== 'approved')) {
    attention.push('PRD／原型尚未单独批准；最终规格确认须包含引用的目标、范围及核心交互。');
  }
  if (snapshot.status === 'completed') {
    currentLabel = '结果';
    status = snapshot.outcome === 'product_approved' ? '产品工作已完成' : '本次范围已完成';
    current = snapshot.summary || (snapshot.outcome === 'product_approved' ? '规格已批准，可交接已批准范围。' : '本次阶段产物已交付，审批状态见产物记录。');
    remaining = snapshot.outcome === 'product_approved' ? '交接已批准规格及其输入引用；产品定义在此结束。' : '本次范围无剩余；完整产品流程以工作流状态为准。';
  } else if (snapshot.status === 'blocked' || snapshot.status === 'cancelled') {
    currentLabel = '结果'; current = details.reason || snapshot.summary || status;
    if (snapshot.status === 'cancelled') remaining = '已停止本次尝试。';
  }
  const displayStatus = artifact => available ? artifactStatusNames[artifact.effective_status] || '未记录' : '上次记录 · 当前未核对';
  return {title:snapshot.title, status, currentLabel, current, remaining,
    change:details.change || snapshot.summary || '暂无新进展申报', attention:attention.join(' '),
    mode:available ? modeNames[product.workflow_mode] || '未记录' : '上次记录 · 未核对',
    stage:stageNames[stage] || '未记录',
    artifact:currentArtifact ? `${artifactNames[currentArtifact.kind]} ${currentArtifact.version} · ${displayStatus(currentArtifact)}` : available ? '尚未生成' : '未记录',
    artifacts:artifacts.map(a => ({...a,displayStatus:displayStatus(a)})),
    receipts, skills:skillRecords(receipts, declaredUses(snapshot.skill_uses)),
    workflow:receipts.some(r => r.kind === 'workflow' && r.name === snapshot.workflow) ? snapshot.workflow : '未记录',
    confirmation:request ? `确认 ${artifactNames[request.target_kind]} ${request.version}（${request.scope_summary}）。请在对话中确认。` : '当前未发起确认请求。',
    readiness:Object.entries(readinessNames).map(([key,label])=>`${label}：${readinessValues[product.readiness?.[key]] || '未记录'}`).join('；'),
    issues:[['待确认假设',product.assumptions],['开放问题',product.questions],['阻断项',product.blockers]],
    approvals:product.approvals ?? [], available,
  };
}

export function historyView(event) {
  const d = event.details ?? {};
  return {title:event.kind === 'skill_loaded' ? `已读取 ${event.skill}` : event.summary || d.change || d.reason || d.current || event.current_step || statusNames[event.status] || '已记录',
    lines:[['本次使用申报',declaredUses(event.skill_uses).map(item => `${item.skill}（${useViaNames[item.via]} · Agent 申报）`).join('；')],['当时模式',modeNames[event.workflow_mode]],['当时阶段',stageNames[event.stage]],['当时动作',d.current],['当时变更',d.change],['当时剩余',d.remaining],['当时原因',d.reason]]
      .filter(([,value])=>value).map(([label,value])=>`${label}：${value}`)};
}
