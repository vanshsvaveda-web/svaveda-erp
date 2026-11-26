import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';
import {loginPage} from '../vercel/auth.js';
const manifest=JSON.parse(await readFile('web/manifest.webmanifest','utf8'));
assert.equal(manifest.start_url,'/');assert.equal(manifest.scope,'/');assert.equal(manifest.display,'standalone');assert.equal(manifest.id,'/');
for(const icon of manifest.icons){
 const response=await worker.fetch(new Request('https://erp.example.invalid'+icon.src),{});
 assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');
 const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 const dimension=Number(icon.sizes.split('x')[0]);assert.equal(bytes.readUInt32BE(16),dimension);assert.equal(bytes.readUInt32BE(20),dimension);
 assert.deepEqual(bytes,await readFile('web'+icon.src));
}
for(const [path,mime] of [['/manifest.webmanifest','application/manifest+json'],['/sw.js','text/javascript; charset=utf-8'],['/mobile.css','text/css; charset=utf-8'],['/appearance.js','text/javascript; charset=utf-8'],['/offline.html','text/html; charset=utf-8']]){
 const response=await worker.fetch(new Request('https://erp.example.invalid'+path),{});assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),mime);
 const head=await worker.fetch(new Request('https://erp.example.invalid'+path,{method:'HEAD'}),{});assert.equal((await head.text()).length,0);
}
const login=loginPage();const html=await login.text();assert.ok(html.includes('rel="manifest"'));assert.ok(html.includes('data-theme-toggle'));assert.ok(html.includes('autocomplete="current-password"'));assert.match(login.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.match(login.headers.get('content-security-policy'),/script-src 'self'/);assert.match(login.headers.get('cache-control'),/no-store/);
const listeners={},cacheRecords=new Map(),cache={addAll:async paths=>{for(const p of paths)cacheRecords.set(p,new Response('OFFLINE'))},match:async request=>cacheRecords.get(typeof request==='string'?request:new URL(request.url).pathname)?.clone(),put:async(request,response)=>cacheRecords.set(new URL(request.url).pathname,response),keys:async()=>[...cacheRecords.keys()],delete:async key=>cacheRecords.delete(key)};
let offline=false;
const context=vm.createContext({URL,Response,caches:{open:async()=>cache,keys:async()=>['svaveda-public-v1'],delete:async()=>true},fetch:async request=>{if(offline)throw Error('offline');return new Response('NETWORK')},self:{location:{origin:'https://erp.example.invalid'},addEventListener:(type,handler)=>listeners[type]=handler,skipWaiting:async()=>{},clients:{claim:async()=>{}}}});
vm.runInContext(await readFile('web/sw.js','utf8'),context);
await new Promise((resolve,reject)=>listeners.install({waitUntil:promise=>promise.then(resolve,reject)}));
assert.ok(!cacheRecords.has('/'));assert.ok([...cacheRecords.keys()].every(p=>p==='/offline.html'||p.startsWith('/icons/')));
async function intercepted(path,{method='GET',mode='cors'}={}){let result;listeners.fetch({request:{url:'https://erp.example.invalid'+path,method,mode},respondWith:promise=>result=promise});return result?await result:null}
assert.equal(await intercepted('/api/workspace'),null);assert.equal(await intercepted('/api/messages'),null);assert.equal(await intercepted('/api/sign-in',{method:'POST'}),null);assert.equal(await intercepted('/api/sign-out',{method:'POST'}),null);
assert.equal(await intercepted('/private-record.json'),null);
assert.equal(await (await intercepted('/',{mode:'navigate'})).text(),'NETWORK');assert.ok(!cacheRecords.has('/'));
offline=true;assert.equal(await (await intercepted('/',{mode:'navigate'})).text(),'OFFLINE');assert.ok(!cacheRecords.has('/'));
offline=false;assert.equal(await (await intercepted('/app.123456abcdef.js')).text(),'NETWORK');assert.ok(cacheRecords.has('/app.123456abcdef.js'));
console.log('PASS: manifest and icon sizes; PNG delivery bytes; public asset types and HEAD; sign-in theme and CSP; network-only private APIs; no cached signed-in HTML; offline navigation fallback; static-only asset caching.');
