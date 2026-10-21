import { readFile, writeFile } from 'node:fs/promises';
// Playwright 1.56.1 forces visible/focused state on its own CDP session.
// A separate public newCDPSession() cannot clear that session's override.
// Disable this one automation feature in our isolated test dependency so
// native tab selection produces actual visibility/focus changes.
const file = new URL('./node_modules/playwright-core/lib/server/chromium/crPage.js', import.meta.url);
const before = 'this._client.send("Emulation.setFocusEmulationEnabled", { enabled: true })';
const after = 'this._client.send("Emulation.setFocusEmulationEnabled", { enabled: false })';
const source = await readFile(file, 'utf8');
if (source.includes(before)) await writeFile(file, source.replace(before, after));
else if (!source.includes(after)) throw Error('Unexpected Playwright internals; review focus handling before using this probe');
console.log('Playwright focus emulation disabled in the isolated test dependency.');
