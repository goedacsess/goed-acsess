// Jalankan ekspresi JS di WebView aplikasi Android (build debug) lewat CDP.
// Pemakaian: node cdp.mjs <port> <file-js>
import { readFileSync } from 'node:fs';
const [port, file] = process.argv.slice(2);
const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = list.find(p => p.type === 'page');
if (!page) { console.log('no page', JSON.stringify(list)); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const expr = readFileSync(file, 'utf8');
const res = await send('Runtime.evaluate', { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true });
const r=res.result||res; console.log(JSON.stringify(r.exceptionDetails?{exc:r.exceptionDetails.exception?.description||r.exceptionDetails.text}:(r.result?.value ?? r), null, 1));
ws.close();
