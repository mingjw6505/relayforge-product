// Synthetic examples only; this module never reads or writes real workflow state.
const now='2026-11-10T10:00:00Z';
const hash='a'.repeat(64);
const receipt=(name,kind)=>({name,kind,sha256:hash,loaded_at:now,source:'mcp_skill_load'});
const prd={id:'prd',kind:'prd',path:'prd.md',version:'v1',sha256:hash,recorded_status:'ready-for-review',effective_status:'ready-for-review',inputs:[],review_required:false};
const spec={...prd,id:'spec',kind:'spec',path:'spec.md',inputs:[{artifact:'prd',version:'v1',sha256:hash}]};
const base={schema_version:1,panel_kind:'relayforge_product',source:'agent_declared',run_id:'00000000-0000-4000-8000-000000000001',revision:1,
  title:'团队知识库 · 搜索与筛选',status:'running',scope:{kind:'product_workflow',target_stage:null},
  steps:[{label:'探索',status:'done'},{label:'澄清',status:'done'},{label:'PRD',status:'active'},{label:'原型',status:'pending'},{label:'规格',status:'pending'},{label:'完成',status:'pending'}],
  summary:'',details:{current:'正在整理搜索行为、筛选规则和成功指标',change:'已明确用户、范围与非目标',remaining:'完成 PRD 并提交评审'},
  product:{requirement:{slug:'knowledge-search',name:'团队知识库'},workflow_mode:'standard',current_stage:'prd',observed_stage:'prd',workflow_status:'ready-for-review',
    artifacts:[prd],approvals:[],readiness:{problem:'present',user:'present',goal:'present',scope:'present',non_goals:'present',success_signal:'present'},
    assumptions:{items:['默认按相关度排序'],total:1},questions:{items:[],total:0},blockers:{items:[],total:0},integrity:{status:'valid',affected:[]}},
  source_state:{status:'available',state_sha256:hash,checked_at:now},confirmation_request:null,outcome:null,
  skill_uses:[{skill:'host:humanizer-zh',via:'direct_read',source:'agent_declared',recorded_at:now},{skill:'relayforge-product:to-prd',via:'context',source:'agent_declared',recorded_at:now}],
  workflow:'using-relayforge-product',skill_loads:[receipt('using-relayforge-product','workflow'),receipt('to-prd','skill')],created_at:now,updated_at:now,
  history:[{revision:1,at:now,kind:'milestone',status:'running',details:{current:'开始编写 PRD v1'},workflow_mode:'standard',stage:'prd'}]};
const waiting={...base,status:'waiting',details:{...base.details,waiting_for:'user',reason:'请确认 PRD v1 的目标、范围与成功指标'},confirmation_request:{target_kind:'prd',artifact_id:'prd',version:'v1',sha256:hash,scope_summary:'目标、范围、成功指标',included_inputs:[]}};
const fast={...waiting,product:{...base.product,workflow_mode:'fast',current_stage:'spec',observed_stage:'spec',artifacts:[prd,spec]},steps:base.steps.map((s,i)=>({...s,status:i<4?'done':i===4?'active':'pending'})),
  skill_loads:[receipt('using-relayforge-product','workflow'),receipt('to-spec','skill')],details:{waiting_for:'user',reason:'规格草案已就绪，等待最终确认',remaining:'确认规格行为、验收标准及引用范围'},
  confirmation_request:{target_kind:'spec',artifact_id:'spec',version:'v1',sha256:hash,scope_summary:'行为、验收标准及引用的 PRD v1 目标与范围',included_inputs:spec.inputs}};
const stale={...base,product:{...base.product,artifacts:[{...prd,effective_status:'needs-review'},{...spec,effective_status:'needs-review'}],integrity:{status:'invalid',affected:['prd','spec']}},details:{current:'复核变更后的 PRD 范围',remaining:'先登记 PRD 新版本，再复核规格'}};
const approved={...base,status:'completed',outcome:'product_approved',summary:'规格 v1 已批准，产品定义完成，可交接批准范围',details:{},steps:base.steps.map(s=>({...s,status:'done'})),
  product:{...base.product,current_stage:'completed',observed_stage:'completed',workflow_status:'approved',artifacts:[{...prd,effective_status:'approved'},{...spec,effective_status:'approved'}],
    approvals:[{artifact:'spec',path:'spec.md',version:'v1',sha256:hash,scope:'行为规则与验收标准',state:'valid',at:now,inputs:spec.inputs}]}};
export const previewScenarios={
  draft:{label:'正在编写 PRD',snapshot:base},review:{label:'等待 PRD 确认',snapshot:waiting},fast:{label:'快速模式 · 规格确认',snapshot:fast},stale:{label:'上游变更 · 审批失效',snapshot:stale},
  complete:{label:'规格已批准 · 产品完成',snapshot:approved},stage:{label:'仅交付 PRD · 本次范围完成',snapshot:{...base,status:'completed',outcome:'stage_delivered',summary:'PRD v1 草案已交付，待评审',scope:{kind:'stage_delivery',target_stage:'prd'},steps:[{label:'编写 PRD',status:'done'}]}},
  disconnected:{label:'进度同步中断',snapshot:waiting,connection:'disconnected'},source:{label:'源状态读取不可用',snapshot:{...waiting,source_state:{status:'unavailable',retained_snapshot:true,checked_at:now}}},
  unavailable:{label:'进度记录不可用',snapshot:waiting,connection:'unavailable'},cancelled:{label:'用户取消本次尝试',snapshot:{...base,status:'cancelled',outcome:'cancelled',summary:'已取消本次产品讨论',steps:base.steps.map(s=>({...s,status:s.status==='active'?'skipped':s.status}))}}
};
