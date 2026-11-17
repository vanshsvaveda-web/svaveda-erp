let projectSelection='', projectView='List', projectTab='Tasks';

function openLeadOutcome(key){
 const lead=data.leads.find(item=>item.id===key);
 if(!lead)return;
 form('Log outcome · '+e(lead.name),select('Outcome','status',options(statuses,lead.status))+select('Contact method','method',options(['Not specified','Call','WhatsApp','Email','Instagram','Other'],lead.method||'Not specified'))+
 area('Outreach notes','note')+input('Next follow-up','due','','date'),
 'Save outcome',value=>{
  if(value.due&&(!lead.owner||value.due<day()))throw Error('Choose a follow-up date today or later for an assigned lead.');
  return {type:'lead-outcome',id:key,...value};
 },'compact');
}

function reviewRows(){
 const tasks=data.tasks.filter(item=>item.status==='In review').map(item=>({id:item.id,title:item.title,owner:item.owner,kind:'Task',date:item.due,at:item.reviewAt}));
 const requests=(data.requests||[]).filter(item=>item.status==='Pending').map(item=>({...item,title:item.kind,kind:'Request',date:[item.start,item.end!==item.start?item.end:''].filter(Boolean).join(' – ')}));
 return [...tasks,...requests];
}
let reviewFilter='All';
function renderReviewQueue(){
 const rows=reviewRows();
 const kind=item=>item.kind==='Task'?'Tasks':item.title==='Leave'?'Leave':'Attendance';
 const filtered=rows.filter(item=>reviewFilter==='All'||kind(item)===reviewFilter);
 const categories=['All','Tasks','Leave','Attendance'];
 ui.innerHTML=title('Review Queue','Review submitted work, leave, and attendance corrections.')+
 `<div class="split review-columns"><div>${panel('Pending review',`<div class="toolbar"><div class="filter-tabs" aria-label="Review filters">${categories.map(label=>`<button data-act="ops-review-tab" data-key="${label}" aria-pressed="${reviewFilter===label}">${label} <span class="tab-count">${label==='All'?rows.length:rows.filter(item=>kind(item)===label).length}</span></button>`).join('')}</div></div>`+
 (filtered.map(item=>listItem(item.title,[item.owner,item.kind==='Task'?'Task submission':item.title,item.at?waitingSince(item.at):'',item.date].filter(Boolean).join(' · '),btn('Review','ops-decision',item.kind+'|'+item.id))).join('')||empty('Nothing is waiting in this view.')))}</div>
 <div>${panel('This week',listItem('Overdue tasks',String(data.tasks.filter(item=>item.status!=='Done'&&item.due&&item.due<day()).length))+listItem('Follow-ups due in the next 7 days',String(data.leads.filter(item=>item.action==='Follow-up'&&item.due>=day()&&item.due<=day(7)).length)))}
 ${panel('Recent activity',(data.activity||[]).slice(0,5).map(item=>listItem(item.action,[item.subject,item.actor,calendarStamp(item.at)].join(' · '))).join('')||empty('No recent activity.'))}</div></div>`;
}
const calendarStamp=timestamp=>new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium'}).format(timestamp);
function personalRequests(){
 return panel('My requests',(data.requests||[]).filter(item=>item.owner===currentName).map(item=>listItem(item.kind,
 [item.start,item.end!==item.start?item.end:'',item.note,item.decisionNote].filter(Boolean).join(' · '),pill(item.status))).join('')||empty('No requests submitted.'));
}
function projectField(value=''){
 return select('Project','projectId','<option value="">No project</option>'+data.projects.map(item=>`<option value="${e(item.id)}" ${item.id===value?'selected':''}>${e(item.name)}</option>`).join(''));
}
function renderProjects(){
 const project=data.projects.find(item=>item.id===projectSelection);
 if(!project){
  ui.innerHTML=title('Projects','Project owners, members, milestones and work.',isEmployee()?'':btn('＋ New project','project','',true))+
  panel('Projects',data.projects.map(item=>{
   const linked=data.tasks.filter(task=>task.projectId===item.id);
   return listItem(item.name,[item.owner,item.due,linked.length+' tasks'].filter(Boolean).join(' · '),btn('Open','ops-project',item.id));
  }).join('')||empty('No projects yet.'));
  return;
 }
 const tasks=data.tasks.filter(item=>item.projectId===project.id);
 const done=tasks.filter(item=>item.status==='Done').length;
 const milestones=project.milestones||[];
 const taskContent=projectView==='Board'?taskBoard(tasks):taskRows(tasks);
 const completed=tasks.length?Math.round(done/tasks.length*100):0;
 const projectTabs=`<div class="toolbar filter-tabs" aria-label="Project sections">${['Tasks','Milestones','Members'].map(name=>`<button data-act="ops-project-tab" data-key="${name}" aria-pressed="${name===projectTab}">${name}</button>`).join('')}</div>`;
 const members=[...new Set([project.owner,...(project.members||[])].filter(Boolean))];
 const content={
  Tasks:`<div class="toolbar"><div class="segments" aria-label="Project task view">${['List','Board'].map(name=>`<button data-act="ops-view" data-key="${name}" aria-pressed="${name===projectView}">${name}</button>`).join('')}</div></div>`+taskContent,
  Milestones:milestones.map(item=>listItem(item.title,item.due||'No date',isEmployee()?pill(item.done?'Complete':'Open'):btn(item.done?'Reopen':'Complete','ops-milestone',item.id))).join('')||empty('No milestones yet.'),
  Members:members.map(name=>listItem(name,name===project.owner?'Project owner':'Project member')).join('')||empty('No project members yet.')
 };
 ui.innerHTML=title(e(project.name),[project.owner?'Owner: '+project.owner:'',project.due?'Target: '+project.due:''].filter(Boolean).map(e).join(' · '),
 btn('Back to Work','nav','Tasks')+(isEmployee()?'':btn('Edit project','project',project.id)+btn('＋ Add task','task','',true)))+
 `<div class="panel project-progress"><div><strong>${completed}% complete</strong><small>${done} of ${tasks.length} visible tasks</small></div><progress max="100" value="${completed}" aria-label="Project progress"></progress></div>`+
 (project.note?`<p>${e(project.note)}</p>`:'')+`<article class="panel">${projectTabs}${content[projectTab]}</article>`;
}
function waitingSince(time){
 const hours=Math.max(0,Math.floor((Date.now()-time)/3600000));
 return hours<1?'Waiting less than 1h':hours<24?'Waiting '+hours+'h':'Waiting '+Math.floor(hours/24)+'d';
}
function taskBoard(tasks){
 return `<div class="project-board">${taskStatuses.map(status=>{
  const items=tasks.filter(task=>task.status===status);
  return `<article><div class="board-heading"><strong>${status}</strong><span class="tab-count">${items.length}</span></div>${items.map(task=>`<button class="board-card" data-act="task" data-key="${e(task.id)}"><strong>${e(task.title)}</strong><small>${e([task.owner||'Unassigned',task.due].filter(Boolean).join(' · '))}</small><span>${e(task.priority||'Medium')} priority</span></button>`).join('')||empty('No tasks')}</article>`;
 }).join('')}</div>`;
}

function openProject(key){
 const project=data.projects.find(item=>item.id===key)||{id:id(),due:day()};
 if(isEmployee())return;
 const names=[...new Set([...data.people.map(item=>item.name),...(roleSeats||[]).filter(item=>item.email).map(item=>item.name)])];
 const members=`<fieldset><legend>Members</legend>${names.map(name=>`<label class="project-member"><input type="checkbox" name="member_${e(name)}" ${project.members?.includes(name)?'checked':''}>${e(name)}</label>`).join('')}</fieldset>`;
 const milestones=(project.milestones||[]).map(item=>item.title+(item.due?' | '+item.due:'')).join('\n');
 form(key?'Edit project':'New project',input('Project name','name',project.name,'text',true)+
 input('Target date','due',project.due,'date')+select('Owner','owner',nameOptions(project.owner))+members+
 area('Milestones (one per line, optional | YYYY-MM-DD)','milestones',milestones)+area('Notes','note',project.note),'Save project',value=>{
  const items=value.milestones.split('\n').map(line=>line.trim()).filter(Boolean).map(line=>{
   const [title,due='']=line.split('|').map(part=>part.trim());
   if(!title||due&&!/^\d{4}-\d{2}-\d{2}$/.test(due))throw Error('Enter milestones as Title | YYYY-MM-DD.');
   const existing=(project.milestones||[]).find(item=>item.title===title&&item.due===due);
   return existing||{id:id(),title,due,done:false};
  });
  Object.assign(project,{name:value.name.trim(),owner:value.owner,due:value.due,note:value.note,
   members:names.filter(name=>value['member_'+name]),milestones:items});
  if(!key)data.projects.push(project);
  projectSelection=project.id;
 });
}
function operationsAction(act,key){
 if(act==='ops-review-tab'&&!isEmployee()){reviewFilter=key;renderReviewQueue();return}
 if(act==='ops-backup'&&isSuperAdmin()){downloadBackup();return}
 if(act==='ops-leave'){const item=(data.requests||[]).find(request=>request.id===key&&request.status==='Approved');if(item)readRecord(e(item.owner)+' · Approved leave','<p>'+e(item.start+' – '+item.end)+'</p>');return}
 if(act==='ops-project-tab'){projectTab=key;renderProjects();return}
 if(act==='ops-project'){projectSelection=key;projectTab='Tasks';page='Projects';render();return}
 if(act==='ops-view'){projectView=key;renderProjects();return}
 if(act==='ops-milestone'&&!isEmployee()){
  const item=data.projects.find(project=>project.id===projectSelection)?.milestones.find(milestone=>milestone.id===key);
  if(item)form(e(item.title),'<p>'+e(item.due)+'</p>',item.done?'Reopen':'Complete',()=>{item.done=!item.done});
  return;
 }
 if(act==='ops-request'&&!isFounder()){
  form('New request',select('Request type','kind',options(['Leave','Attendance correction'],key||'Leave'))+
   input('Start date','start',day(),'date',true)+input('End date','end',day(),'date',true)+area('Reason or correction details','note')+'<div class="event-times">'+input('Correct check-in (IST, corrections only)','checkIn','','time')+input('Correct check-out (IST, corrections only)','checkOut','','time')+'</div>',
   'Submit request',value=>({type:'request',...value}));
  return;
 }
 if(act==='ops-decision'&&!isEmployee()){
  const [kind,id]=key.split('|');
  const item=reviewRows().find(row=>row.id===id&&row.kind===kind);
  if(!item)return;
  const task=kind==='Task'&&data.tasks.find(record=>record.id===id);
  form(e(item.title),'<p>'+e([item.owner,item.date,item.correction?item.correction.in+'–'+item.correction.out+' IST':'',item.note||task?.note].filter(Boolean).join(' · '))+'</p>'+
   (task?download(task.file)+download(task.submission)+(task.comments||[]).map(comment=>'<p>'+e(comment)+'</p>').join(''):'')+
   select('Decision','decision','<option value="approve">Approve</option><option value="return">Return for changes</option>')+
   area('Reviewer note','note'),'Save decision',value=>({type:'decision',kind,id,...value}));
 }
}

let sheetError='', nextSheetPull=0;
async function pullSheet(link,connecting=false){
 const batches=[];
 let startRow=1;
 do{
  const response=await fetch('/api/sheets/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({link,startRow})});
  const result=await response.json();
  if(!response.ok)throw Error(result.error||'Google Sheets could not be read.');
  if(result.csv?.trim())batches.push(result.csv);
  startRow=result.nextRow;
 }while(startRow);
 if(!batches.length)throw Error('The Sheet tab is empty.');
 const imported=importCsv(batches.join('\n'),'Google Sheets');
 data.sheetLink=link;
 data.sheetSyncedAt=Date.now();
 await save();
 sheetError='';
 if(connecting)notify(imported.added+' new leads imported');
 return imported;
}
async function autoPullSheet(){
 if(!isSuperAdmin()||!data?.sheetLink||busy||modal.open||Date.now()<nextSheetPull)return;
 nextSheetPull=Date.now()+5*60000;
 busy=true;
 try{
  if(!await updateWorkspace())return;
  if(data.sheetLink){
   const result=await pullSheet(data.sheetLink);
   if((result.added||result.updated)&&['Experts','Expert Leads','Pipeline','My Day','Tasks','Inbox'].includes(page)&&!document.activeElement?.matches('input,textarea,select'))render();
  }
 }catch(error){data=structuredClone(committed);sheetError=error.message;}
 finally{busy=false;updateSyncLabel()}
}
function updateSyncLabel(){
 const label=$('#sheet-status');
 if(label)label.textContent=sheetError?'Sync needs attention: '+sheetError:data.sheetSyncedAt?
  'Last synced '+new Date(data.sheetSyncedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}):'Waiting for first sync';
}
function renderIntegrations(){
 ui.innerHTML=title('Settings','Manage access, Google Sheets, and workspace exports.')+
 panel('Google Sheets',`<form id="sheet-link" class="item">${input('Google Sheet link','link',data.sheetLink,'url',true)}<p>Use Name (Expert) and Contact Number (General), or Name and Phone, on the same header row near the top. New contacts sync automatically while a Super Admin has the ERP open.</p><button class="primary">${data.sheetLink?'Change connection':'Connect Sheet'}</button> ${data.sheetLink?btn('Disconnect','sheet-disconnect'):''}<p id="sheet-status" role="status"></p></form>`)+
 panel('CSV and backup',`<div class="item"><div class="actions">${btn('Import Sheet CSV','import')}${btn('Export leads CSV','export')}${btn('Download ERP records','ops-backup')}</div></div>`);
 updateSyncLabel();
 $('#sheet-link').onsubmit=async event=>{
  event.preventDefault();if(busy)return;
  const form=event.currentTarget, link=new FormData(form).get('link').trim(), button=form.querySelector('button');
  button.disabled=true;busy=true;
  try{await pullSheet(link,true);nextSheetPull=Date.now()+5*60000;render()}
  catch(error){data=structuredClone(committed);sheetError=error.message;updateSyncLabel()}
  finally{button.disabled=false;busy=false}
 };
}
function downloadBackup(){
 const url=URL.createObjectURL(new Blob([JSON.stringify({exportedAt:new Date().toISOString(),data},null,2)],{type:'application/json'}));
 const link=document.createElement('a');link.href=url;link.download='svaveda-records-'+day()+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

const taskTemplates={
 'Expert introduction':['Contact the expert','Introduce SvaVeda, confirm specialization and availability, and record the next agreed action.'],
 'Verify expert documents':['Verify expert documents','Check that qualifications and required documents are complete. Record missing items and submit the result for review.'],
 'Publish first program':['Review first program listing','Check the title, description, schedule, and pricing. Record any changes required before publishing.'],
 'Weekly team review':['Prepare weekly team review','Review overdue work, pending approvals, and expert follow-ups. Summarize decisions and assign next actions.']
};
function templateField(){
 return `<label class="template-field">Task template<select id="task-template"><option value="">Blank task</option>${Object.keys(taskTemplates).map(name=>`<option>${e(name)}</option>`).join('')}</select></label>`;
}
function chooseTemplate(name){
 if(!Object.hasOwn(taskTemplates,name))return;
 const fields=modal.querySelector('form')?.elements;
 if(!fields)return;
 const [title,note]=taskTemplates[name];
 if(!fields.title.value)fields.title.value=title;
 if(!fields.note.value)fields.note.value=note;
}
function renderInbox(){
 const today=day();
 const tasks=data.tasks.filter(task=>task.owner===currentName&&task.status!=='Done'&&task.status!=='In review');
 const followUps=data.leads.filter(lead=>lead.owner===currentName&&lead.due&&lead.due<=today&&
  !['Do not contact','Not interested','Invalid number','Onboarded','Program listed'].includes(lead.status));
 const attention=tasks.filter(task=>task.status==='Rework'||task.due&&task.due<=today);
 ui.innerHTML=title('Inbox','Updates that need your attention.',btn('Refresh','inbox-refresh'))+
 `<div class="split inbox-layout"><div>${panel('My task updates · '+attention.length,attention.map(task=>listItem(task.title,
 [task.status==='Rework'?'Returned for changes':task.due<today?'Overdue':'Due today',task.due].filter(Boolean).join(' · '),btn('Open task','task',task.id))).join('')||empty('No task updates need attention.'))}
 ${panel('Expert follow-ups · '+followUps.length,followUps.map(lead=>listItem(lead.name,'Due '+lead.due,btn('Log outcome','outcome',lead.id))).join('')||empty('No follow-ups due.'))}</div>
 <div>${!isEmployee()?panel('Founder reviews',listItem('Pending submissions',reviewRows().length+' to review',btn('Review queue','nav','Review Queue'))):''}
 ${personalRequests()}</div></div>`;
}
function renderPipeline(){
 const stages=[
  ['New',['New','Not reachable']],['Outreach',['Contacted','Follow-up','Interested']],
  ['Registered',['Registered']],['Verified',['Verified']],['Program listed',['Program listed','Onboarded']],
  ['Closed',['Not interested','Invalid number','Do not contact']]
 ];
 ui.innerHTML=title('Expert pipeline','See each expert’s stage, owner, and next action.',btn('Lead list','expert-view','List'))+
 `<div class="panel"><div class="project-board pipeline-board">${stages.map(([stage,statuses])=>{
  const leads=data.leads.filter(lead=>statuses.includes(lead.status));
  return `<article><div class="board-heading"><strong>${stage}</strong><span class="tab-count">${leads.length}</span></div>${leads.map(lead=>`<div class="pipeline-record"><button class="link" data-act="lead" data-key="${e(lead.id)}">${e(lead.name)}</button><small>${e(lead.owner||'Unassigned')}</small>${pill(lead.status)}<p>${e(lead.action||'No next action')}${lead.due?' · '+e(lead.due):''}</p>${stage==='Closed'||lead.status==='Onboarded'?'':btn('Log outcome','outcome',lead.id)}</div>`).join('')||empty('No leads')}</article>`;
 }).join('')}</div></div>`;
}

function workProjects(){
 return panel('Projects',(isEmployee()?'':`<div class="toolbar">${btn('New project','project','',true)}</div>`)+
 (data.projects.map(item=>listItem(item.name,[item.owner,item.due].filter(Boolean).join(' · '),btn('Open','ops-project',item.id))).join('')||empty('No projects yet.')));
}
