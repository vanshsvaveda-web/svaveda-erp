import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto,randomUUID} from 'node:crypto';
const state={orgKey:'svaveda',people:[{name:'Avery'},{name:'Jamie'}],seats:[{name:'Avery',role:'Founder',email:'avery@example.invalid'},{name:'Jamie',role:'Employee',email:'jamie@example.invalid'}],tasks:[{id:'shared-task',owners:['Avery','Jamie'],projectId:'shared-project'},{id:'private-task',owner:'Avery'}],projects:[{id:'shared-project',owner:'Avery',members:['Jamie']},{id:'private-project',owner:'Avery'}],leads:[{id:'shared-lead',owners:['Avery','Jamie']},{id:'private-lead',owner:'Avery'}],events:[],reviews:[],messages:[]};
const members=[{id:'avery',email:'avery@example.invalid',name:'Avery'},{id:'jamie',email:'jamie@example.invalid',name:'Jamie'}],records=[];
let joins=[];
const DB={prepare(sql){return {bind(...args){return {first:async()=>{
 if(sql.includes('FROM workspace_state'))return {workspace_id:'workspace',revision:1,payload:JSON.stringify(state)};
 if(sql==='SELECT email FROM message_members WHERE user_id = ?')return members.find(m=>m.id===args[0]);
 if(sql.startsWith('SELECT COUNT(*)'))return {count:members.filter(m=>args.includes(m.id)).length};
 if(sql.includes('FROM direct_messages'))return records.find(m=>m.id===args[0]);
 throw Error(sql);
},all:async()=>{
 if(sql.includes('FROM message_members'))return {results:members.filter(m=>m.id!==args[0])};
 if(sql.includes('FROM direct_messages'))return {results:records.filter(m=>m.sender_id===args[0]||m.recipient_id===args[0]).slice().reverse().map(m=>({id:m.id,sender:m.sender_id,recipient:m.recipient_id,body:m.body,file:m.attachment_name,created:m.created_at}))};
 throw Error(sql);
},run:async()=>{
 if(sql.startsWith('INSERT INTO message_members')){joins.push(args);return {meta:{changes:1}}}
 if(sql.startsWith('INSERT INTO direct_messages')){if(records.some(m=>m.id===args[0]))return {meta:{changes:0}};records.push(Object.fromEntries(['id','sender_id','recipient_id','body','attachment_name','attachment_data','created_at'].map((key,i)=>[key,args[i]])));return {meta:{changes:1}}}
 throw Error(sql);
}}}}}};
const context=vm.createContext({crypto:webcrypto,TextEncoder,Response,Request,URL,Date,console,atob});
for(const file of ['web/assignees.js','worker/roles.mjs','web/message-links.js','worker/messages.mjs'])vm.runInContext(await readFile(file,'utf8'),context);
vm.runInContext("const privateHeaders={'Cache-Control':'private, no-store'};const json=(value,status=200)=>Response.json(value,{status,headers:privateHeaders});const readPayload=request=>request.json();globalThis.run=messages;globalThis.parseLinks=messageLinks;globalThis.plain=messagePlainText;",context);
const call=async(body,{user='avery',method='POST',path='/api/messages',version,origin='https://erp.example.invalid',directory}={})=>context.run(new Request('https://erp.example.invalid'+path,{method,headers:{'oai-authenticated-user-id':user,'oai-authenticated-user-email':members.find(m=>m.id===user)?.email||'unknown@example.invalid','Content-Type':'application/json',Origin:origin,...(version?{'X-Message-Version':version}:{})},...(method==='POST'?{body:JSON.stringify(body)}:{})}),{DB,...(directory?{MESSAGE_DIRECTORY:directory}:{})},path);
const payload=(body,recipient='jamie')=>({id:randomUUID(),recipient,body});
let shared=payload('Review [[task:shared-task]] [[project:shared-project]] [[lead:shared-lead]]');
assert.equal((await call(shared)).status,200);
assert.equal((await call(shared)).status,200);assert.equal(records.length,1,'retry must not duplicate');
assert.equal((await call({...shared,body:'changed'})).status,409,'ID collision must reject changed content');
for(const kind of ['task','project','lead']){
 assert.equal((await call(payload('Hidden [['+kind+':private-'+kind+']]'))).status,403,'recipient needs record access');
 assert.equal((await call(payload('Hidden [['+kind+':private-'+kind+']]','avery'),{user:'jamie'})).status,403,'sender needs record access');
}
assert.equal((await call(payload('Reply [[reply:'+shared.id+']]'))).status,200);
const note=payload('Saved private note','avery');await call(note);
assert.equal((await call(payload('Cross-chat [[reply:'+note.id+']]'))).status,403);
assert.equal((await call(payload('Missing [[reply:missing-id]]'))).status,403);
assert.equal((await call(payload('Hello'),{origin:'https://evil.example.invalid'})).status,403);
assert.equal((await call(payload('Hello'),{user:'removed'})).status,403);
assert.equal((await call({name:'Impersonation'},{path:'/api/messages/join'})).status,200);assert.equal(joins.at(-1)[2],'Avery');
let response=await call(null,{method:'GET'}),result=await response.json();assert.equal(result.messages.length,3);
assert.equal((await call(null,{method:'GET',version:result.version})).status,204);
await call(payload('New incoming','avery'),{user:'jamie'});assert.equal((await call(null,{method:'GET',version:result.version})).status,200);
assert.equal(context.parseLinks('[[task:shared-task]] [[task:shared-task]]').length,1);
assert.equal(context.plain('Hello [[task:shared-task]]'),'Hello');
console.log('PASS: shared record links; sender and recipient ACLs for task/project/lead; same-chat replies; private-note boundaries; idempotent retry; collision rejection; CSRF; removed seat; trusted directory name; conditional refresh; token deduplication.');

const automatic=async()=>[...members.map(m=>({...m,role:'Employee',available:true})),{id:'seat-pending',name:'Pending teammate',email:'pending@example.invalid',role:'Employee',available:false}];
response=await call(null,{method:'GET',directory:automatic});result=await response.json();
assert.equal(result.automaticDirectory,true);assert.equal(result.directory.length,2);assert.equal(result.directory.find(p=>p.id==='seat-pending').available,false);assert.ok(result.directory.every(p=>!('email' in p)),'directory must not expose email addresses');
const beforeJoins=joins.length;
assert.equal((await call(payload('No join required'),{directory:automatic})).status,200);
assert.equal(joins.length,beforeJoins);
assert.equal((await call(payload('Pending','seat-pending'),{directory:automatic})).status,403);
assert.equal((await call(payload('Removed','removed'),{directory:automatic})).status,403);
assert.equal((await call(payload('Hidden [[task:private-task]]'),{directory:automatic})).status,403);
console.log('PASS: automatic team directory; no-join delivery; inactive and removed recipient rejection; private email redaction; shared-record ACLs preserved.');
