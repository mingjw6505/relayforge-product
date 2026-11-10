import {cardView, historyView, artifactNames} from './view.mjs';
import {terminal} from './poller.mjs';

const stepNames = {pending:'待处理',active:'进行中',done:'阶段工作完成',blocked:'受阻',skipped:'已跳过'};
const stepIcons = {pending:'',active:'',done:'✓',blocked:'!',skipped:'−'};
const connectionNames = {connecting:'正在同步进度…',synced:'',disconnected:'同步暂时中断，保留最后记录并重试。',paused:'已暂停刷新；产品工作继续进行。',unavailable:'进度记录已不可用，停止刷新并保留最后记录。'};
const time = value => {const date=new Date(value);return Number.isNaN(date.getTime())?'未记录':date.toLocaleString([], {hour12:false});};

export function createPanel(root, {onPauseToggle=()=>{}}={}) {
  const document = root.ownerDocument;
  const el = name => root.querySelector(`[data-ui="${name}"]`);
  let latest=null, syncState='connecting', allHistory=false, paused=false;
  function node(tag,value,className='') {const n=document.createElement(tag);n.textContent=value;if(className)n.className=className;return n;}
  function renderHistory() {
    const history=latest.history??[];
    const opened=new Set([...el('history').querySelectorAll('details[open]')].map(n=>n.dataset.revision));
    el('history').replaceChildren(...(allHistory?history:history.slice(-3)).slice().reverse().map(event=>{
      const view=historyView(event), li=document.createElement('li'), details=document.createElement('details');
      details.dataset.revision=String(event.revision);details.open=opened.has(details.dataset.revision);
      const summary=document.createElement('summary');summary.append(node('time',time(event.at)),node('span',view.title));
      const body=node('div','','rf-history-body');
      view.lines.forEach(line=>body.append(node('p',line)));
      if(!view.lines.length)body.append(node('p','这条记录没有更多阶段详情；已读取不代表执行或批准。'));
      details.append(summary,body);li.append(details);return li;
    }));
    el('history-count').textContent=`保留 ${history.length} 条`;
    el('more-history').hidden=history.length<=3;
    el('more-history').textContent=allHistory?'仅显示最近 3 条':`查看全部 ${history.length} 条记录`;
    el('more-history').setAttribute('aria-expanded',String(allHistory));
  }
  function syncControls() {
    const ended=latest&&terminal(latest.status);
    el('refresh').disabled=Boolean(ended||syncState==='unavailable');
    el('refresh').textContent=ended?'本次任务已结束':syncState==='unavailable'?'记录不可用':paused?'恢复刷新':'暂停刷新';
  }
  function updateFreshness(now=Date.now()) {el('stale').hidden=!(latest?.status==='running'&&syncState==='synced'&&now-Date.parse(latest.updated_at)>90000);}
  function setConnection(state) {syncState=state;paused=state==='paused';el('connection').hidden=state==='synced';el('connection').textContent=connectionNames[state]??connectionNames.disconnected;syncControls();updateFreshness();}
  function render(snapshot) {
    const different=latest?.run_id!==snapshot.run_id;
    const previousStep=latest?.steps.findIndex(s=>['active','blocked'].includes(s.status));
    if(different){allHistory=false;el('records').hidden=true;el('details').setAttribute('aria-expanded','false');el('details-label').textContent='查看详情';el('input-section').open=false;el('load-section').open=false;el('history').replaceChildren();}
    latest=snapshot;const view=cardView(snapshot);
    el('empty').hidden=true;el('task').hidden=false;root.dataset.status=snapshot.status;
    for(const key of ['title','status','current','remaining','workflow','change','mode','stage','artifact','confirmation','readiness'])el(key).textContent=view[key];
    el('current-label').textContent=view.currentLabel;el('attention').textContent=view.attention;el('attention').hidden=!view.attention;
    el('skills').textContent=view.skills.map(s=>s.name).join(' · ')||'未记录';
    const scroll=different?0:el('steps').scrollLeft;
    el('steps').replaceChildren(...snapshot.steps.map((step,index)=>{
      const li=node('li','',`rf-step-${step.status}`);li.dataset.connected=String(index>0&&snapshot.steps[index-1].status==='done');li.setAttribute('aria-label',`${step.label}：${stepNames[step.status]}`);
      const mark=node('span',stepIcons[step.status],'rf-step-icon');mark.setAttribute('aria-hidden','true');if(step.status==='active')li.setAttribute('aria-current','step');li.append(mark,node('span',step.label,'rf-step-label'));return li;
    }));
    el('steps').scrollLeft=scroll;
    const index=snapshot.steps.findIndex(s=>['active','blocked'].includes(s.status));
    if(index>=0&&(different||index!==previousStep)) {const steps=el('steps'),item=steps.children[index];steps.scrollLeft+=item.getBoundingClientRect().left-steps.getBoundingClientRect().left-(steps.clientWidth-item.clientWidth)/2;}
    el('artifacts').replaceChildren(...view.artifacts.map(a=>{const li=node('li','','rf-artifact');li.append(node('span',`${artifactNames[a.kind]} ${a.version}`),node('span',a.displayStatus));li.dataset.state=view.available?a.effective_status:'unknown';return li;}));
    if(!view.artifacts.length)el('artifacts').append(node('li',view.available?'尚无已登记产物':'产物状态未记录'));
    el('issues').replaceChildren(...view.issues.map(([label,value])=>{
      const group=document.createElement('details');const summary=document.createElement('summary');summary.textContent=`${label}：${value?.total===null||value?.total===undefined?'未记录':value.total+' 项'}`;
      const content=document.createElement('ul');(value?.items??[]).forEach(v=>content.append(node('li',v)));if(value?.total>value.items.length)content.append(node('li',`其余 ${value.total-value.items.length} 项请查看工作流记录。`));group.append(summary,content);return group;
    }));
    el('inputs').replaceChildren(...view.artifacts.map(a=>{
      const group=node('div','','rf-input-item');group.append(node('p',`${artifactNames[a.kind]} ${a.version} · 指纹 ${a.sha256.slice(0,12)}…`));
      a.inputs.forEach(i=>group.append(node('p',`输入 ${i.artifact} ${i.version} · ${i.sha256.slice(0,12)}…`)));
      view.approvals.filter(r=>r.artifact===a.id).forEach(r=>group.append(node('p',`${view.available?({valid:'有效',stale:'失效',superseded:'已替代'}[r.state]||'未记录'):'上次记录 · 当前未核对'} · ${r.version} · ${time(r.at)} · ${r.scope}${r.includes_input_scope?'（包含登记的输入范围，不单独批准输入）':''}`)));
      return group;
    }));
    el('load-section').hidden=!view.receipts.length;el('load-heading').textContent=`工作流与 Skill 加载记录 · ${view.receipts.length} 项`;
    el('loads').replaceChildren(...view.receipts.map(r=>{const li=document.createElement('li');li.append(node('time',time(r.loaded_at)),node('span',r.name,'rf-load-name'),node('span',`已读取 · ${r.sha256.slice(0,8)}`));return li;}));
    el('updated').textContent=`阶段申报 ${time(snapshot.updated_at)}`;
    el('checked').textContent=`源状态最近核对 ${time(snapshot.source_state?.checked_at)}；自动刷新只读取进度缓存，不监视源文件。`;
    renderHistory();syncControls();updateFreshness();
  }
  el('details').onclick=()=>{const open=el('details').getAttribute('aria-expanded')!=='true';el('details').setAttribute('aria-expanded',String(open));el('details-label').textContent=open?'收起详情':'查看详情';el('records').hidden=!open;};
  el('more-history').onclick=()=>{allHistory=!allHistory;renderHistory();};el('refresh').onclick=onPauseToggle;
  return {render,setConnection,updateFreshness};
}
