import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto,createHash} from 'node:crypto';
const context=vm.createContext({crypto:webcrypto,TextEncoder,Response,AbortSignal,URL,Date,console,structuredClone});
for(const file of ['web/assignees.js','worker/operations.mjs','worker/sheets.mjs'])vm.runInContext(await readFile(file,'utf8'),context);
vm.runInContext("globalThis.free=firstFreeLeadRow;globalThis.merge=mergeBackgroundSheet;globalThis.op=operate;globalThis.suppressed=leadTaskSuppressed;globalThis.sync=syncSheetLead;globalThis.json=(value,status=200)=>Response.json(value,{status});sheetToken=async()=> 'synthetic-token';",context);
const rows=[['Name','Sq','Phone','Notes'],['First',1,'9999999999'],['',2,'',''],['Later',3,'8888888888']];
const reader=async range=>{const m=range.match(/^A(\d+):[A-Z]+(\d+)$/);return rows.slice(Number(m[1])-1,Number(m[2]));};
assert.equal(await context.free(reader,1,4,4,1),3,'the first gap is reused before later populated leads');
rows[2][3]='=IF(TRUE,"","")';assert.equal(await context.free(reader,1,4,4,1),undefined,'formulas are preserved even when they display blank');
rows[2][3]='Protected note';assert.equal(await context.free(reader,1,4,4,1),undefined,'values outside mapped columns protect the row');
rows[2]=['',2,'',''];assert.equal(await context.free(reader,1,4,4,1),3,'a prefilled serial does not occupy an empty row');
const paged=async range=>{const m=range.match(/^A(\d+):[A-Z]+(\d+)$/);return Array.from({length:Number(m[2])-Number(m[1])+1},(_,i)=>Number(m[1])+i===105?['',105]:['Occupied',Number(m[1])+i])};
assert.equal(await context.free(paged,2,150,4,1),105,'row scans cross batch boundaries');
const admin={role:'Super Admin',name:'Admin',user:'admin'},employee={role:'Employee',name:'Employee'},founder={role:'Founder',name:'Founder'};
const fresh=()=>({leads:[{id:'lead-a',name:'Expert',phone:'9999999999',owner:'Admin',action:'Call',due:'2026-11-27',source:'Google Sheets'}],tasks:[{id:'task-a',lead:'lead-a',title:'Call expert',owner:'Admin',status:'In progress',timer:Date.now()-1000,elapsed:100},{id:'task-b',title:'Unrelated',status:'To do'}],projects:[],people:[{name:'Admin'}],seats:[],sheetQueue:{'lead-a':{fields:['name'],nextAt:0}},sheetLink:'https://docs.google.com/spreadsheets/d/abcdefghijklmnop/edit'});
const state=fresh();
assert.throws(()=>context.op(employee,state,{type:'record-delete',kind:'lead',id:'lead-a'}),/Super Admin/);
assert.throws(()=>context.op(founder,state,{type:'record-delete',kind:'task',id:'task-a'}),/Super Admin/);
context.op(admin,state,{type:'record-delete',kind:'lead',id:'lead-a'});
assert.equal(state.leads.length,0);assert.equal(state.tasks.length,1);assert.equal(state.tasks[0].id,'task-b');assert.equal(state.sheetQueue['lead-a'],undefined);
assert.equal(state.deletedRecords.length,1);assert.equal(state.deletedRecords[0].tasks[0].timer,undefined);
assert.ok(state.deletedRecords[0].tasks[0].elapsed>=1100);
const headers=['Name','Phone','Team Member','Next Action'];
assert.equal(context.merge(state,[headers,['Expert','+91 9999999999','Admin','Call']]).added,0,'deleted leads cannot be resurrected by scheduled import');
const trashId=state.deletedRecords[0].id;
assert.throws(()=>context.op(founder,state,{type:'record-restore',id:trashId}),/Super Admin/);
context.op(admin,state,{type:'record-restore',id:trashId});
assert.equal(state.leads.length,1);assert.equal(state.tasks.length,2);assert.equal(state.deletedRecords.length,0);
assert.equal(state.tasks.find(t=>t.id==='task-a').timer,undefined,'restored timers stay paused');
const taskState=fresh();taskState.sheetQueue={};taskState.leads[0].note='Old';taskState.leads[0].sheetSnapshot={phone:'9999999999',name:'Expert',owner:'Admin',action:'Call',note:'Old'};
context.op(admin,taskState,{type:'record-delete',kind:'task',id:'task-a'});
assert.equal(taskState.leads.length,1);assert.equal(context.suppressed(taskState.leads[0]),true);
const merged=context.merge(taskState,[[...headers,'Notes'],['Expert','9999999999','Admin','Call','New']]);assert.equal(merged.updated,1);
assert.equal(taskState.tasks.some(t=>t.lead==='lead-a'),false,'import does not recreate a deleted next-step task');
context.op(admin,taskState,{type:'record-restore',id:taskState.deletedRecords[0].id});
assert.equal(context.suppressed(taskState.leads[0]),false);assert.equal(taskState.tasks.length,2);
const collision=fresh();context.op(admin,collision,{type:'record-delete',kind:'lead',id:'lead-a'});
collision.leads.push({id:'different',phone:'+91 9999999999'});
assert.throws(()=>context.op(admin,collision,{type:'record-restore',id:collision.deletedRecords[0].id}),/phone already exists/);
// Exercise the real Sheet writer with fake Google responses. No external requests.
async function writeCase(grid,lead){
 let changes=[],saved;
 const g=structuredClone(grid),columnCount=5;
 context.fetch=async(url,opts={})=>{
  const text=String(url);
  if(opts.method==='POST'){
   const body=JSON.parse(opts.body);changes.push(body);
   for(const req of body.requests||[])if(req.updateCells){
    const {rowIndex,columnIndex}=req.updateCells.start;g[rowIndex]||=[];
    g[rowIndex][columnIndex]=req.updateCells.rows[0].values[0].userEnteredValue.stringValue;
   }
   return Response.json({});
  }
  if(text.includes('?fields='))return Response.json({sheets:[{properties:{sheetId:0,title:'DB',index:0,gridProperties:{rowCount:g.length,columnCount}}}]});
  const match=decodeURIComponent(text.split('/values/')[1]?.split('?')[0]||'').match(/!([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  assert.ok(match,'valid bounded range: '+text);
  const index=letters=>[...letters].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1;
  return Response.json({values:g.slice(Number(match[2])-1,Number(match[4])).map(row=>row.slice(index(match[1]),index(match[3])+1))});
 };
 const work={leads:[lead],sheetLink:'https://docs.google.com/spreadsheets/d/abcdefghijklmnop/edit',sheetQueue:{[lead.id]:{fields:['name','phone','note'],attempts:0,nextAt:0}}};
 const DB={prepare(){return {bind(payload){saved=JSON.parse(payload);return {run:async()=>({meta:{changes:1}})}}}}};
 const result=await context.sync({state:work,workspace:'fake',revision:1},{DB,GOOGLE_SHEETS_SERVICE_ACCOUNT:'fake',SHEET_WRITES_SERIALIZED:true},lead.id);
 return {status:result.status,changes,saved,g};
}
const grid=[['Sq','Name','Phone','Notes','Unused'],[1,'Existing','8888888888'],[2], [3,'Later','7777777777']];
const inserted=await writeCase(grid,{id:'new',name:'New expert',phone:'9999999999',note:'New note'});
assert.equal(inserted.status,200);assert.ok(inserted.changes[0].requests.every(r=>r.updateCells.start.rowIndex===2));
assert.equal(inserted.g[2][0],2,'existing serial number is preserved');assert.equal(inserted.g[2][1],'New expert');
assert.equal(inserted.g[3][1],'Later','a later populated record is untouched');
const full=await writeCase(grid.filter((_,i)=>i!==2),{id:'new',name:'New expert',phone:'9999999999'});
assert.equal(full.status,200);assert.ok(full.changes[0].requests[0].appendCells,'only append when no safe blank row remains');
// Run the production workspace handler with fixture-only DB storage.
process.env.SVAVEDA_OWNER_EMAIL_HASH=createHash('sha256').update('admin@example.invalid').digest('hex');
const {default:worker}=await import('../dist/server/index.js');
let current={...fresh(),orgKey:'svaveda',events:[],messages:[],reviews:[],requests:[],attendance:{},attendanceByUser:{},seats:[{name:'Founder',role:'Founder',email:'founder@example.invalid'},{name:'Employee',role:'Employee',email:'employee@example.invalid'}]},revision=1;
const DB={prepare(){return {bind(...args){return {first:async()=>({workspace_id:'admin',revision,payload:JSON.stringify(current)}),run:async()=>{if(args[2]!==revision)return {meta:{changes:0}};current=JSON.parse(args[0]);revision++;return {meta:{changes:1}}}}}}}};
const call=async(email,method='GET',body)=>worker.fetch(new Request('https://erp.example.invalid/api/workspace',{method,headers:{Origin:'https://erp.example.invalid','Content-Type':'application/json','oai-authenticated-user-id':email,'oai-authenticated-user-email':email},...(body?{body:JSON.stringify(body)}:{})}),{DB});
let visible=await(await call('admin@example.invalid')).json();
let result=await call('admin@example.invalid','PUT',{data:visible.data,revision:visible.revision,command:{type:'record-delete',kind:'lead',id:'lead-a'}});
assert.equal(result.status,200);assert.equal(current.leads.length,0);assert.equal(current.tasks.length,1);assert.equal(Object.keys(current.sheetQueue).length,0);
visible=await(await call('founder@example.invalid')).json();assert.equal(visible.data.deletedRecords,undefined,'deleted snapshots are not exposed to founders');
result=await call('founder@example.invalid','PUT',{data:visible.data,revision:visible.revision,command:{type:'record-restore',id:current.deletedRecords[0].id}});assert.equal(result.status,400);
visible=await(await call('admin@example.invalid')).json();
result=await call('admin@example.invalid','PUT',{data:visible.data,revision:visible.revision,command:{type:'record-restore',id:current.deletedRecords[0].id}});
assert.equal(result.status,200);assert.equal(current.leads.length,1);assert.equal(current.tasks.length,2);assert.equal(Object.keys(current.sheetQueue).length,0,'restore itself does not write to Google Sheets');
visible=await(await call('founder@example.invalid')).json();visible.data.tasks=[];
result=await call('founder@example.invalid','PUT',{data:visible.data,revision:visible.revision});assert.equal(result.status,403,'deletion by omission cannot bypass admin-only commands');assert.equal(current.tasks.length,2);
console.log('PASS: first free Sheet row, serial preservation, occupied/formula protection, bounded scans, real writer row selection and append fallback; admin-only deletion/restoration, cascade, timer pause, queue cleanup, import suppression, restoration collision checks, private deleted records and API authorization.');
