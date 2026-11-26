import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
process.env.SVAVEDA_OWNER_EMAIL_HASH=createHash('sha256').update('admin@example.invalid').digest('hex');
const {default:worker}=await import('../dist/server/index.js');
let revision=1,state={orgKey:'svaveda',people:[{name:'Vansh',role:'Administrator'},{name:'Jamie'}],seats:[{name:'Jamie',email:'jamie@example.invalid',role:'Employee'}],tasks:[{id:'task-shared',owner:'Jamie',owners:['Jamie','Vansh'],title:'Synthetic assigned work',status:'To do',projectId:'project-shared'},{id:'task-private',owner:'Vansh',title:'Synthetic private work',status:'To do'}],projects:[{id:'project-shared',owner:'Vansh',members:['Jamie']}],leads:[{id:'lead-shared',owner:'Jamie',phone:'9999999999',name:'Synthetic expert',sheetSnapshot:{phone:'9999999999'}}],events:[],messages:[],reviews:[],attendance:{},requests:[],sheetLink:'https://docs.google.com/spreadsheets/d/synthetic/edit',sheetQueue:{'lead-shared':{attempts:1,nextAt:10,error:'private upstream error'}}};
const DB={
 prepare(sql){
  return {bind(...args){
   return {
    first:async()=>({workspace_id:'admin',revision,payload:JSON.stringify(state)}),
    run:async()=>{
     assert.ok(sql.startsWith('UPDATE workspace_state'));
     if(args[2]!==revision)return {meta:{changes:0}};
     state=JSON.parse(args[0]);revision++;return {meta:{changes:1}};
    }
   };
  }};
 }
};
const call=async(method,body,extra={})=>worker.fetch(new Request('https://erp.example.invalid/api/workspace',{method,headers:{Origin:'https://erp.example.invalid','Content-Type':'application/json','oai-authenticated-user-id':'jamie','oai-authenticated-user-email':'jamie@example.invalid',...extra},...(body?{body:JSON.stringify(body)}:{})}),{DB});
let response=await call('GET'),snapshot=await response.json();assert.equal(response.status,200);assert.equal(snapshot.data.tasks.length,1);assert.equal(snapshot.data.leads[0].syncState.status,'retrying');assert.ok(!JSON.stringify(snapshot).includes('private upstream error'));
const command={type:'work-comment',kind:'task',id:'task-shared',commentId:'delivery-one',text:'Ready for review',mentions:['Vansh']};
response=await call('PUT',{data:snapshot.data,revision,command});assert.equal(response.status,200);let saved=await response.json();assert.equal(saved.data.tasks[0].discussion[0].actor,'Jamie');assert.equal(state.tasks.length,2);assert.equal(state.tasks.find(t=>t.id==='task-private').owner,'Vansh');assert.ok(state.sheetQueue['lead-shared']);
response=await call('PUT',{data:saved.data,revision:1,command:{...command,commentId:'stale'}});assert.equal(response.status,409);
response=await call('PUT',{data:saved.data,revision,command:{...command,id:'task-private',commentId:'forbidden'}});assert.equal(response.status,400);assert.equal(state.tasks.find(t=>t.id==='task-private').discussion,undefined);
response=await call('PUT',{data:saved.data,revision,command:{...command,kind:'project',id:'project-shared',commentId:'project-post'}});assert.equal(response.status,200);assert.equal(state.projects[0].discussion[0].actor,'Jamie');
console.log('PASS: compiled production worker GET/PUT; scoped sync delivery; authorized task/project discussion persistence; existing private records and Sheet queue preserved; stale revision and private-record writes rejected.');
