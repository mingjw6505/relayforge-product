import {App} from '@modelcontextprotocol/ext-apps';
import {PanelPoller} from './poller.mjs';
import {createPanel} from './render.mjs';

const app = new App({name: 'RelayForge Product Progress', version: __PLUGIN_VERSION__},
  {availableDisplayModes: ['inline']}, {autoResize: true});
const root = document.getElementById('rf-progress');
const panel = createPanel(root, {onPauseToggle: () => {
  if (poller.paused) poller.resume();
  else poller.pause();
}});
const poller = new PanelPoller({
  callTool: args => app.callServerTool(args, {timeout: 10000}),
  onSnapshot: panel.render,
  onState: panel.setConnection,
});
function context(value) {
  if (value?.theme) root.dataset.theme = value.theme === 'dark' ? 'dark' : 'light';
}
function visibility() {poller.setVisible(!document.hidden);}
app.ontoolresult = result => {
  if (poller.bind(result.structuredContent, {replace: true})) {
    panel.setConnection(poller.unavailable ? 'unavailable' : poller.paused ? 'paused' : 'synced');
  }
};
app.onhostcontextchanged = context;
let watchdog;
app.onteardown = async () => {
  poller.close();
  clearInterval(watchdog);
  document.removeEventListener('visibilitychange', visibility);
  return {};
};
visibility();
document.addEventListener('visibilitychange', visibility);
panel.setConnection('connecting');
try {
  await app.connect();
  context(app.getHostContext());
  poller.connected();
  watchdog = setInterval(panel.updateFreshness, 15000);
} catch {
  panel.setConnection('disconnected');
  root.querySelector('[data-ui="empty"]').textContent = '卡片未连接；产品工作可继续。';
}
