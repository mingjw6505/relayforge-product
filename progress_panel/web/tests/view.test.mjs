import test from 'node:test';
import assert from 'node:assert/strict';
import {cardView} from '../src/view.mjs';

const base={title:'知识库',status:'running',scope:{kind:'product_workflow'},steps:[{label:'PRD',status:'active'}],source_state:{status:'available'},product:{workflow_mode:'standard',observed_stage:'prd',artifacts:[{id:'prd',kind:'prd',version:'v1',effective_status:'ready-for-review'}],integrity:{status:'valid'},readiness:{}}};
test('reviewable artifact alone does not mean approval or waiting confirmation',()=>{
  const view=cardView(base);assert.equal(view.status,'进行中');assert.match(view.artifact,/未批准/);assert.equal(view.workflow,'未记录');
});
test('source failure never labels retained approval as currently valid',()=>{
  const view=cardView({...base,source_state:{status:'unavailable'},product:{...base.product,artifacts:[{...base.product.artifacts[0],effective_status:'approved'}]}});
  assert.match(view.artifact,/未核对/);assert.doesNotMatch(view.artifact,/已批准/);assert.match(view.attention,/读取不可用/);
  const pending=cardView({...base,status:'waiting',details:{waiting_for:'user'},source_state:{status:'unavailable'},confirmation_request:{target_kind:'prd',version:'v1',scope_summary:'旧范围'}});
  assert.notEqual(pending.status,'等待你确认');assert.doesNotMatch(pending.attention,/当前确认/);
});
test('stage delivery and approved product completion have different results',()=>{
  assert.equal(cardView({...base,status:'completed',outcome:'stage_delivered'}).status,'本次范围已完成');
  assert.equal(cardView({...base,status:'completed',outcome:'product_approved'}).status,'产品工作已完成');
});
test('fast specification keeps unapproved inputs and bound scope visible',()=>{
  const view=cardView({...base,status:'waiting',details:{waiting_for:'user'},confirmation_request:{target_kind:'spec',version:'v1',scope_summary:'行为、PRD目标范围与原型交互'},product:{...base.product,workflow_mode:'fast',observed_stage:'spec'}});
  assert.equal(view.status,'等待你确认');assert.match(view.attention,/尚未单独批准/);assert.match(view.attention,/原型交互/);
});
test('invalidation and waiting targets remain explicit',()=>{
  const view=cardView({...base,status:'waiting',details:{waiting_for:'external',reason:'等待访谈资料'},product:{...base.product,integrity:{status:'invalid',affected:['prd','spec']}}});
  assert.equal(view.status,'等待外部资料');assert.equal(view.current,'等待访谈资料');assert.match(view.attention,/2 项产物需复核/);
});
