import { start } from './_monogame/monogame-web-host.js';
const events = [];
let releaseManaged;
const managedGate = new Promise(r => { releaseManaged = r; });
const gated = new URLSearchParams(location.search).has('managedGate');
globalThis.probe = {
  events, host: null, control: null, stopSettled: false, readyState: 'pending',
  waitManagedStart: () => gated ? managedGate : Promise.resolve(), releaseManaged,
  snapshot: () => probe.control ? JSON.parse(probe.control.Snapshot()) : [],
  stop() { const p = probe.host.stop(); p.then(() => { probe.stopSettled = true; }); return p; },
  exit: () => probe.control.ExitCurrent(),
  loseContext: () => document.querySelector('canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()
};
const log = (type, data) => { events.push({ time: performance.now(), type, data }); document.querySelector('#status').textContent = JSON.stringify(events.slice(-5), null, 2); };
probe.host = start({ root: document.querySelector('#root'), canvas: document.querySelector('canvas'), canvasResizePolicy: 'Project',
  onStatus: data => log('status', data), onError: data => log('error', data), onFirstFrame: () => { log('first-frame', null); if (new URLSearchParams(location.search).has('stopFirstFrame')) void probe.stop(); } });
probe.host.ready.then(() => { probe.readyState = 'resolved'; }, e => { probe.readyState = 'rejected'; probe.readyError = { code: e.code, message: e.message }; });
(async () => {
  while (!probe.host.runtime && !probe.host.isDisposed) await new Promise(r => setTimeout(r, 10));
  if (probe.host.runtime) {
    const exports = await probe.host.runtime.getAssemblyExports('Probe.dll'); probe.control = exports.Mge.WebGL2.Probe.ProbeControl;
  }
})().catch(e => log('page-error', String(e)));
document.addEventListener('visibilitychange', () => log('visibility', document.visibilityState));
