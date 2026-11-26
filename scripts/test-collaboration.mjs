import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
process.env.SVAVEDA_OWNER_EMAIL_HASH=createHash('sha256').update('admin@example.invalid').digest('hex');
const {default:worker}=await import('../dist/server/index.js');
let revision=1,state={orgKey:'svaveda',people:[{name:'Vansh',role:'Administrator'},{name:'Jamie',role:'Employee'},{name:'Founder',role:'Founder'}],seats:[{name:'Jamie',email:'jamie@example.invalid',role:'Employee'},{name:'Founder',email:'founder@example.invalid',role:'Founder'}],leads:[],tasks:[{id:'private',owner:'Jamie',title:'Private task',status:'To do'}],projects:[],events:[],messages:[],reviews:[],requests:[],attendance:{},attendanceByUser:{}};
const notes=[];
const DB={prepare(sql){return {bind(...args){return {
 first:async()=>{
  if(sql.includes('FROM workspace_state'))return {workspace_id:'admin',revision,payload:JSON.stringify(state)};
  if(sql.startsWith('select count(*)'))return {count:notes.filter(n=>n.workspace_id===args[0]&&n.user_id===args[1]).length};
  if(sql.startsWith('select id from public.workspace_notes'))return notes.find(n=>n.workspace_id===args[0]&&n.user_id===args[1]&&n.id===args[2]);
  throw Error(sql);
 },all:async()=>{
  if(sql.includes('from public.workspace_notes'))return {results:notes.filter(n=>n.workspace_id===args[0]&&n.user_id===args[1])};
  throw Error(sql);
 },run:async()=>{
  if(sql.startsWith('UPDATE workspace_state')){if(args[2]!==revision)return {meta:{changes:0}};state=JSON.parse(args[0]);revision++;return {meta:{changes:1}}}
  if(sql.startsWith('insert into public.workspace_notes')){const prior=notes.find(n=>n.workspace_id===args[0]&&n.user_id===args[1]&&n.id===args[2]);if(prior){prior.body=args[3];prior.updated_at=args[5]}else notes.push(Object.fromEntries(['workspace_id','user_id','id','body','created_at','updated_at'].map((k,i)=>[k,args[i]])));return {meta:{changes:1}}}
  throw Error(sql);
 }
}}}}};
const directory=async()=>[{id:'admin',name:'Vansh',role:'Super Admin',email:'admin@example.invalid',available:true},{id:'jamie',name:'Jamie',role:'Employee',email:'jamie@example.invalid',available:true},{id:'founder',name:'Founder',role:'Founder',email:'founder@example.invalid',available:true}];
const call=async(path,{user='jamie',method='GET',body,origin='https://erp.example.invalid'}={})=>worker.fetch(new Request('https://erp.example.invalid'+path,{method,headers:{Origin:origin,'Content-Type':'application/json','oai-authenticated-user-id':user,'oai-authenticated-user-email':user+'@example.invalid'},...(body?{body:JSON.stringify(body)}:{})}),{DB,MESSAGE_DIRECTORY:directory,CLIENT_IP:'192.0.2.10'});
let snapshot=await (await call('/api/workspace')).json();
const put=async(command,user='jamie')=>{const snap=await (await call('/api/workspace',{user})).json();return call('/api/workspace',{user,method:'PUT',body:{data:snap.data,revision:snap.revision,command}})};
assert.equal((await put({type:'attendance',action:'in',at:1})).status,200);const date=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});assert.ok(Math.abs(state.attendanceByUser.jamie[date].in-Date.now())<5000);assert.equal(state.attendanceByUser.jamie[date].checkInIp,'192.0.2.10');assert.equal(state.attendanceEvents[0].kind,'Checked in');
assert.equal((await put({type:'attendance',action:'in'})).status,400);assert.equal((await put({type:'attendance',action:'lunch'})).status,200);assert.equal(state.attendanceEvents[0].kind,'Lunch started');assert.equal((await put({type:'attendance',action:'break'})).status,200);assert.equal(state.attendanceEvents[0].kind,'Lunch ended');assert.equal((await put({type:'attendance',action:'out'})).status,200);assert.equal(state.attendanceEvents[0].kind,'Checked out');assert.equal((await put({type:'attendance',action:'in'},'founder')).status,400);
let monthly=await call('/api/team-attendance?month='+date.slice(0,7),{user:'founder'});assert.equal(monthly.status,200);const founderMonthly=await monthly.json();assert.ok(!JSON.stringify(founderMonthly).includes('192.0.2.10'));assert.ok(!founderMonthly.people.some(p=>p.name==='Founder'));assert.equal((await call('/api/team-attendance')).status,403);assert.equal((await call('/api/team-attendance?month=invalid',{user:'admin'})).status,400);
const adminMonthly=await (await call('/api/team-attendance?month='+date.slice(0,7),{user:'admin'})).json();assert.ok(JSON.stringify(adminMonthly).includes('192.0.2.10'));
const noteId=randomUUID();assert.equal((await call('/api/notes',{method:'POST',body:{id:noteId,body:'Synthetic private idea',user_id:'founder'}})).status,200);assert.equal(notes[0].user_id,'jamie');assert.equal((await (await call('/api/notes',{user:'founder'})).json()).notes.length,0);assert.equal((await call('/api/notes',{method:'POST',body:{id:noteId,body:'Edited idea'}})).status,200);assert.equal(notes.length,1);assert.equal(notes[0].body,'Edited idea');assert.equal((await call('/api/notes',{method:'POST',origin:'https://elsewhere.invalid',body:{id:noteId,body:'CSRF'}})).status,403);
snapshot=await (await call('/api/workspace')).json();snapshot.data.attendance[date].in=1;assert.equal((await call('/api/workspace',{method:'PUT',body:{data:snapshot.data,revision:snapshot.revision}})).status,200);assert.notEqual(state.attendanceByUser.jamie[date].in,1,'raw task saves cannot forge attendance');
const ownTaskId=randomUUID();assert.equal((await put({type:'task-create',id:ownTaskId,title:'Synthetic personal to-do',department:'Engineering',hours:'2',repeat:'None'})).status,200);assert.equal(state.tasks[0].owner,'Jamie');assert.equal(state.tasks[0].hours,2);assert.equal((await put({type:'task-create',id:randomUUID(),title:'Attempted reassignment',owners:['Vansh']})).status,400);assert.equal((await put({type:'task-create',id:ownTaskId,title:'Synthetic personal to-do'})).status,200);assert.equal(state.tasks.filter(task=>task.id===ownTaskId).length,1);
console.log('PASS: server-timed check-in/out and lunch breaks; duplicate action rejection; manager attendance events; monthly employee-only summaries; founder IP redaction; employee manager-access denial; private notes and edit idempotency; forged ownership and CSRF rejection; raw attendance tampering rejected.');
