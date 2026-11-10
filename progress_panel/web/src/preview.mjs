import {createPanel} from './render.mjs';
import {previewScenarios} from './preview-data.mjs';

const root = document.getElementById('relayforge-product-progress-preview');
const card = root.querySelector('#rf-preview-card');
const picker = root.querySelector('#rf-preview-scenario');
const state = {scenario: 'draft', appearance: 'auto'};
let paused = false;
const panel = createPanel(card, {onPauseToggle: () => {
  paused = !paused;
  syncPreview();
}});
for (const [value, scenario] of Object.entries(previewScenarios)) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = scenario.label;
  picker.append(option);
}
function render() {
  if (!Object.hasOwn(previewScenarios, state.scenario)) state.scenario = 'draft';
  picker.value = state.scenario;
  if (state.appearance === 'auto') delete card.dataset.theme;
  else card.dataset.theme = state.appearance;
  const scenario = previewScenarios[state.scenario];
  // Isolate disclosure state between examples while reusing the production renderer.
  const exampleId = String(Object.keys(previewScenarios).indexOf(state.scenario) + 1).padStart(12, '0');
  panel.render({...scenario.snapshot, run_id: `00000000-0000-4000-8000-${exampleId}`});
  syncPreview();
}
function syncPreview() {
  const scenario = previewScenarios[state.scenario];
  panel.setConnection(paused ? 'paused' : scenario.connection ?? 'synced');
  // The example's clock stays next to its synthetic timestamp, not the real task clock.
  panel.updateFreshness(Date.parse(scenario.snapshot.updated_at) + 30000);
}
function restore(saved) {
  const value = saved?.modelContent?.scenario;
  if (Object.hasOwn(previewScenarios, value)) state.scenario = value;
  const appearance = saved?.privateContent?.appearance;
  if (['auto', 'light', 'dark'].includes(appearance)) state.appearance = appearance;
  render();
}
function remember() {
  const result = window.openai?.setWidgetState?.({
    modelContent: {scenario: state.scenario, label: previewScenarios[state.scenario].label},
    privateContent: {appearance: state.appearance},
  });
  result?.catch(() => {});
}
picker.onchange = () => {state.scenario = picker.value; paused = false; render(); remember();};
window.addEventListener('openai:set_globals', event => {
  if (event.detail?.globals?.widgetState) restore(event.detail.globals.widgetState);
});
restore(window.openai?.widgetState);
if (globalThis.Tweak) {
  const tweak = new Tweak({container: card, onChange: () => {render(); remember();}});
  tweak.addSelect(state, 'appearance', {label: '主题', options: [
    {label: '跟随界面', value: 'auto'}, {label: '浅色', value: 'light'}, {label: '深色', value: 'dark'},
  ]});
}
