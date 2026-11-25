let projectSelection='', projectView='List', projectTab='Tasks';

function openQuickLead(){
 const people=[...new Set([...data.people.map(person=>person.name),...(roleSeats||[]).filter(seat=>seat.email).map(seat=>seat.name)])].filter(name=>name&&name!==currentName);
 form('Quick capture',input('Expert name','name','','text',true)+input('Phone (optional)','phone','','tel')+
  input('Instagram @handle or profile link (optional)','instagram')+area('Note (optional)','instructions')+
  select('Who should fill in the details?','researcher','<option value="">I’ll handle it</option>'+options(people,''))+
  '<p>Choose a teammate to collect the details and send the lead back to you for outreach.</p>',
 'Save lead',values=>{
  const {researcher,...details}=values;
  const lead={id:id(),status:'New',source:'Manual',quickCaptured:true};
  if(researcher)lead.researchReturnTo=currentName;
  setLead(lead,{...details,owners:[researcher||currentName],due:day(1),
    action:researcher?'Complete expert details':values.instagram?'Review Instagram lead':'Review new lead'});
 },'compact');
}

function openLeadResearch(lead){
 form('Complete expert details · '+e(lead.name),
  '<p>Send the details back to '+e(lead.researchReturnTo)+' for outreach.</p>'+
  input('Expert name','name',lead.name,'text',true)+input('Phone','phone',lead.phone,'tel')+
  input('Instagram @handle or profile link','instagram',lead.instagram)+input('Specialization','area',lead.area)+
  (lead.instructions?'<p>'+e(lead.instructions)+'</p>':'')+area('Research notes','researchNotes',lead.researchNotes),
  'Send back for outreach',values=>({type:'lead-research-complete',id:lead.id,...values}),'compact');
}

function followUpHistory(lead){
 const entries=loggedFollowUps(lead);
 const rows=entries.map((entry,index)=>`<div class="item"><strong>Follow-up #${entry.number||entries.length-index}</strong><p>${e([entry.date,entry.actor,entry.method,entry.status].filter(Boolean).join(' · '))}</p>${entry.previousAction?`<p>Action: ${e(entry.previousAction)}</p>`:''}${entry.note?`<p>${e(entry.note)}</p>`:''}${entry.nextAction?`<p>Next: ${e([entry.nextAction,entry.nextDue].filter(Boolean).join(' · '))}</p>`:''}</div>`).join('');
 return `<details class="task-options"><summary>Follow-up history · ${entries.length} logged</summary>${rows||empty('No follow-ups logged yet.')}</details>`;
}

function openLeadOutcome(key){
 const lead=data.leads.find(item=>item.id===key);
 if(!lead)return;
 if(lead.researchReturnTo){
  if(assignedTo(lead,currentName)){openLeadResearch(lead);return;}
  notify('Details are assigned to '+assigneeLabel(lead)+'. The lead returns to '+lead.researchReturnTo+' after submission.');
  return;
 }
 const phone=normalized(lead.phone||'');
 const instagram=leadInstagram(lead.instagram||leadColumn(lead,'IG (Personal)'));
 const contact=(phone||instagram)&&!['Do not contact','Invalid number','Not interested','Onboarded','Program listed'].includes(lead.status);
 const methods=[...(phone?['Call','WhatsApp']:[]),...(instagram?['Instagram']:[])];
 const method=methods.includes(lead.method)?lead.method:methods[0];
 const launch=contact?`<div class="follow-up-contact">${select('Contact method','method',options(methods,method))}<a class="contact-action" id="follow-up-contact">Open contact</a></div>`:'';
 const count=loggedFollowUps(lead).length;
 const context=[assigneeLabel(lead)||'Unassigned',count+' previously logged',lead.action,lead.due&&'Due '+lead.due].filter(Boolean).join(' · ');
 form('Follow-up #'+(count+1)+' · '+e(lead.name),'<p>'+e(context)+'</p>'+(lead.researchNotes?'<p><strong>Research notes:</strong> '+e(lead.researchNotes)+'</p>':'')+launch+
 select('Outcome','status',options(statuses,lead.status))+input('Next step','action','')+
 input('Follow-up date','due',lead.due>=day()?lead.due:'','date')+area('Notes','note','')+followUpHistory(lead),
 'Save follow-up',value=>({type:'lead-outcome',id:key,...value}), 'compact');
 const fields=modal.querySelector('form').elements;
 const updateNextStep=()=>{
  const canPlan=assignees(lead).length&&!['Do not contact','Invalid number','Not interested','Onboarded','Program listed'].includes(fields.status.value);
  fields.action.disabled=fields.due.disabled=!canPlan;
 };
 fields.status.onchange=updateNextStep;updateNextStep();
 const link=$('#follow-up-contact');
 if(!link)return;
 const mode=modal.querySelector('[name=method]');
 const update=()=>{
  const whatsapp=mode.value==='WhatsApp';
  const social=mode.value==='Instagram';
  link.href=social?'https://www.instagram.com/'+encodeURIComponent(instagram)+'/':whatsapp?'https://wa.me/'+(phone.length===10?'91'+phone:phone):'tel:'+lead.phone.replace(/[^+\d]/g,'');
  link.target=whatsapp||social?'_blank':'_self';
  link.rel='noopener noreferrer';
  link.textContent=social?'Open Instagram':whatsapp?'Open WhatsApp':'Open dialer';
 };
 mode.onchange=update;update();
}

function reviewRows(){
 const tasks=data.tasks.filter(item=>item.status==='In review').map(item=>({id:item.id,title:item.title,owner:assigneeLabel(item),kind:'Task',date:item.due,at:item.reviewAt}));
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
  '<div class="project-card-grid">'+(data.projects.filter(project=>!isOnboardingProject(project)).map(item=>{
   const linked=data.tasks.filter(task=>task.projectId===item.id),done=linked.filter(task=>task.status==='Done').length;
   const overdue=linked.filter(task=>task.status!=='Done'&&task.due&&task.due<day()).length;
   const percent=linked.length?Math.round(done/linked.length*100):0;
   const nextDue=item.due||linked.filter(task=>task.status!=='Done'&&task.due).map(task=>task.due).sort()[0];
   const members=[...new Set([item.owner,...(item.members||[])].filter(Boolean))];
   return `<article class="project-card"><button class="link project-open" data-act="ops-project" data-key="${e(item.id)}">Open project →</button><span class="project-card-top"><span class="project-card-symbol">${workspaceIcon('tasks')}</span>${overdue?'<span class="pill amber">'+overdue+' overdue</span>':'<span class="pill good">'+(percent===100?'Complete':'Active')+'</span>'}</span><strong>${e(item.name)}</strong><span class="project-card-owner">${e(item.owner||'Unassigned')} · ${linked.length} tasks</span><span class="project-card-progress"><span>Progress</span><strong>${percent}%</strong></span><progress max="100" value="${percent}" aria-label="${e(item.name)} progress"></progress><span class="project-card-bottom"><span>${nextDue?'Due '+e(calLabel(nextDue,{day:'numeric',month:'short'})):'No target date'}</span><span class="task-owners">${members.slice(0,3).map(name=>'<span title="'+e(name)+'">'+e(name.split(/\s+/).slice(0,2).map(part=>part[0]).join(''))+'</span>').join('')}</span></span><details class="project-inline-tasks"><summary>View tasks (${linked.length})</summary>${linked.length?linked.slice(0,5).map(task=>`<div><button class="link" data-act="task" data-key="${e(task.id)}">${e(task.title)}</button>${pill(task.status)}</div>`).join(''):empty('No tasks yet. Add the first task from this project.')}${linked.length>5?btn('See all tasks','ops-project',item.id):''}</details></article>`;
  }).join('')||empty('No projects yet.'))+'</div>';
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
 (isOnboardingProject(project)?btn('Back to lead tasks','nav','Lead Tasks'):btn('Back to Daily Operations','nav','Tasks'))+(isEmployee()?'':btn('Edit project','project',project.id)+btn('＋ Add task','task','',true)))+
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
  return `<article><div class="board-heading"><strong>${status}</strong><span class="tab-count">${items.length}</span></div>${items.map(task=>`<button class="board-card" data-act="task" data-key="${e(task.id)}"><strong>${e(task.title)}</strong><small>${e([assigneeLabel(task)||'Unassigned',task.due].filter(Boolean).join(' · '))}</small><span>${e(task.priority||'Medium')} priority</span></button>`).join('')||empty('No tasks')}</article>`;
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

let sheetError='', sheetWriteError='', nextSheetPull=0;
async function processSheetQueue(){
 if(!data || busy || modal.open || (isSuperAdmin()&&!Object.keys(data.sheetQueue||{}).length))return;
 busy=true;
 try{
  const response=await fetch('/api/sheets/process',{method:'POST'});
  if(response.status===409)return;
  const result=await response.json();
  if(!response.ok)throw Error(result.error||'Unable to process Sheet updates.');
  if(result.processed)await updateWorkspace();
  sheetWriteError=result.failed?'Some Sheet changes are waiting to retry.':'';
 }catch(error){sheetWriteError=error.message;}
 finally{busy=false;updateSyncLabel()}
}
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
 try{await updateWorkspace();updateSyncLabel();}catch(error){sheetError=error.message;updateSyncLabel();}
}
function updateSyncLabel(state=data){
 const label=$('#sheet-status');
 if(!label)return;
 const format=time=>new Date(time).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'});
 const sync=state.sheetSync;
 if(sync){
  const late=Date.now()-sync.finishedAt>8*60000;
  label.textContent=(late?'Sync overdue. ':sync.status==='success'?'Background sync successful. ':'Sync needs attention: '+sync.error+' ')+
   'Last run '+format(sync.finishedAt)+(sync.lastSuccessAt?' · Last successful '+format(sync.lastSuccessAt):'')+
   ' · '+(sync.pending??Object.keys(state.sheetQueue||{}).length)+' queued writes · Runs every 5 minutes, even when the ERP is closed.';
 }else label.textContent=sheetWriteError?'Sync needs attention: '+sheetWriteError:sheetError?'Sync needs attention: '+sheetError:state.sheetSyncedAt?
  'Last imported '+format(state.sheetSyncedAt)+' · Waiting for first background run.':'Waiting for first background run.';
}
function renderIntegrations(){
 ui.innerHTML=title('Settings','Manage access, Google Sheets, and workspace exports.')+
 panel('Google Sheets',`<form id="sheet-link" class="item">${input('Google Sheet link','link',data.sheetLink,'url',true)}<p>Use Name (Expert) and Contact Number (General), or Name and Phone, on the same header row near the top. The server imports Sheet changes and retries queued ERP updates every 5 minutes, even when nobody has the ERP open. Saved lead changes also queue for immediate write-back while using the ERP.</p><button class="primary">${data.sheetLink?'Change connection':'Connect Sheet'}</button> ${data.sheetLink?btn('Disconnect','sheet-disconnect'):''}<p id="sheet-status" role="status"></p></form>`)+
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
 ui.innerHTML=title('Notifications','Task updates, follow-ups, requests and messages.',btn('Enable desktop alerts','desktop-enable')+btn('Refresh','inbox-refresh'))+
 notificationPanel(true);
}
let pipelineScope='All leads',pipelineQuery='';
function renderPipeline(){
 const stages=[
  ['New',['New','Not reachable']],['Outreach',['Contacted','Follow-up','Interested']],
  ['Registered',['Registered']],['Verified',['Verified']],['Program listed',['Program listed','Onboarded']],
  ['Closed',['Not interested','Invalid number','Do not contact']]
 ];
 ui.innerHTML=title('Expert pipeline','See each expert’s stage, owner, and next action.',isEmployee()?'':btn('＋ Quick capture','quick-lead','',true))+leadGenerationTabs('Pipeline')+
 `<div class="toolbar pipeline-filters"><input id="pipeline-search" type="search" aria-label="Search pipeline" placeholder="Search name, phone or next action" value="${e(pipelineQuery)}"><div class="segments">${['All leads','My leads','Unassigned'].map(scope=>`<button data-act="pipeline-scope" data-key="${scope}" aria-pressed="${pipelineScope===scope}">${scope}</button>`).join('')}</div></div><div class="panel pipeline-panel"><div class="project-board pipeline-board">${stages.map(([stage,statuses])=>{
  const leads=data.leads.filter(lead=>statuses.includes(lead.status)&&(pipelineScope!=='My leads'||assignedTo(lead,currentName))&&(pipelineScope!=='Unassigned'||!assignees(lead).length)&&[lead.name,lead.phone,lead.action,assigneeLabel(lead)].join(' ').toLowerCase().includes(pipelineQuery.toLowerCase()));
  return `<article class="pipeline-column"><div class="pipeline-stage-heading"><h2>${stage}</h2><span class="tab-count">${leads.length}</span></div><div class="pipeline-stage-leads" role="region" aria-label="${stage} leads" tabindex="0">${leads.map(lead=>`<div class="pipeline-record"><button class="link pipeline-lead-name" data-act="lead" data-key="${e(lead.id)}">${e(lead.name)}</button>${lead.action||lead.due?'<p class="pipeline-next">'+e(['Follow-up #'+(loggedFollowUps(lead).length+1),lead.action,lead.due?'Due '+calLabel(lead.due,{day:'numeric',month:'short'}):''].filter(Boolean).join(' · '))+'</p>':''}<div class="pipeline-card-bottom"><span class="pipeline-owner-status"><small title="${e(assigneeLabel(lead)||'Unassigned')}">${e(assigneeLabel(lead)||'Unassigned')}</small>${lead.status!=='New'&&lead.status!==stage?pill(lead.status):''}</span>${stage==='Closed'||lead.status==='Onboarded'?'':btn('Follow up','outcome',lead.id)}</div></div>`).join('')||empty('No leads')}</div></article>`;
 }).join('')}</div></div>`;
 $('#pipeline-search').oninput=event=>{pipelineQuery=event.target.value;renderPipeline();$('#pipeline-search').focus();};
}

let performancePeriod='Daily', performanceDate='';
const taskResultKeys=['actualOutput','actualHours','kpiActual','proofUrl'];
const taskAmount=(label,name,value='')=>`<label>${label}<input type="number" min="0" step="any" name="${name}" value="${e(value)}"></label>`;
const taskResultFields=t=>area('Actual output','actualOutput',t.actualOutput)+taskAmount('Actual hours (overrides timer total)','actualHours',t.actualHours)+
 taskAmount(t.kpi?'Actual KPI value ('+e(t.kpi)+')':'Actual KPI value','kpiActual',t.kpiActual)+input('Deliverable URL','proofUrl',t.proofUrl,'url');
const taskResultsDetails=t=>`${t.expectedOutput?'<p><strong>Expected:</strong> '+e(t.expectedOutput)+'</p>':''}${t.actualOutput?'<p><strong>Delivered:</strong> '+e(t.actualOutput)+'</p>':''}${/^https?:\/\//i.test(t.proofUrl||'')?'<p><a href="'+e(t.proofUrl)+'" target="_blank" rel="noopener noreferrer">Open deliverable</a></p>':''}`;
function taskPlanFields(t){
 return '<p id="task-points" aria-live="polite"></p>'+
 select('Department','department',options(['Choose department',...taskDepartments],t.department,'Choose department'))+
 select('Task type','taskType',options(['Choose type',...taskTypes],t.taskType,'Choose type'))+
 input('Planned work date','plannedDate',t.plannedDate||t.due,'date')+
 area('Expected output','expectedOutput',t.expectedOutput)+input('KPI name','kpi',t.kpi)+
 input('KPI unit','kpiUnit',t.kpiUnit)+select('KPI rollup','kpiRollup',options(['Total','Average','Latest'],t.kpiRollup||'Total'))+
 taskAmount('KPI target','kpiTarget',t.kpiTarget);
}

function renderTaskPerformance(){
 const date=performanceDate||day();
 const [start,end]=taskPeriod(date,performancePeriod);
 const summary=taskSummary(data.tasks,start,end,time=>day(0,time));
 const {planned,finished,pending,unplanned,plannedPoints,completedPoints,completedPlannedPoints,hours,score}=summary;
 const stats=[['Planned points',plannedPoints],['Completed points',completedPoints],['Plan completion',score===null?'—':score+'%'],
  ['Hours on completed tasks',hours.toFixed(2)],['Pending planned tasks',pending.length],['Unplanned tasks completed',unplanned.length]];
 const groups=new Map(), kpis=new Map();
 for (const task of [...finished].sort((a,b)=>a.completedAt-b.completedAt)) {
  const department=task.department||'Uncategorised';
  const group=groups.get(department)||{count:0,points:0};
  group.count++;group.points+=taskPoints(task);groups.set(department,group);
  const label=String(task.kpi||'').trim();
  if (!label) continue;
  const unit=String(task.kpiUnit||'').trim();
  const rollup=task.kpiRollup||'Total';
  const key=JSON.stringify([department,label.toLowerCase(),unit.toLowerCase(),rollup]);
  const metric=kpis.get(key)||{department,label,unit,rollup,target:[],actual:[]};
  for(const [field,source] of [['target','kpiTarget'],['actual','kpiActual']]){
   if(task[source]==null||task[source]===''||!Number.isFinite(Number(task[source])))continue;
   metric[field].push(Number(task[source]));
  }
  kpis.set(key,metric);
 }
 const showKpi=(values,rollup)=>{
  if(!values.length)return '—';
  const total=values.reduce((sum,value)=>sum+value,0);
  const value=rollup==='Latest'?values.at(-1):rollup==='Average'?total/values.length:total;
  return e(value.toLocaleString('en-IN',{maximumFractionDigits:3}));
 };
 const linkedTask=t=>btn(e(t.title),'task',t.id);
 const finishedRows=finished.map(t=>`<tr><td>${linkedTask(t)}</td><td>${e(assigneeLabel(t)||'Unassigned')}</td><td>${e(t.actualOutput||'—')}</td><td>${taskPoints(t)||'—'}</td></tr>`);
 const pendingRows=pending.map(t=>`<tr><td>${linkedTask(t)}</td><td>${e(t.expectedOutput||'—')}</td><td>${e(t.plannedDate||t.due)}</td><td>${pill(t.status)}</td></tr>`);
 const projectRows=data.projects.flatMap(project=>{
  const closed=finished.filter(t=>t.projectId===project.id&&t.taskType==='Project-based').length;
  const open=pending.filter(t=>t.projectId===project.id&&t.taskType==='Project-based').length;
  return closed||open?[`<tr><td>${e(project.name||project.title||'Project')}</td><td>${closed}</td><td>${open}</td></tr>`]:[];
 });
 ui.innerHTML=title(isEmployee()?'My performance':'Task performance','Review deliverables, planned workload and recorded KPI results.',btn('View tasks','nav','Tasks'))+
 `<div class="panel"><div class="toolbar view-toolbar"><div class="segments" aria-label="Reporting period">${['Daily','Weekly','Monthly'].map(period=>`<button data-act="performance-period" data-key="${period}" aria-pressed="${period===performancePeriod}">${period}</button>`).join('')}</div><label>Reporting date <input id="performance-date" type="date" value="${date}"></label><span>${start}${start===end?'':' to '+end} · IST</span></div></div>`+
 panel('Execution',`<div class="split">${stats.map(([label,value])=>listItem(label,String(value))).join('')}</div><div class="panel-foot"><p>${completedPlannedPoints} of ${plannedPoints} planned points completed within the period · ${planned.length} planned tasks</p></div>`)+
 panel('Deliverables',finishedRows.length?table(['Task','Assignee','Actual output','Points'],finishedRows):empty('No dated completions in this period.'))+
 panel('Pending planned work',pendingRows.length?table(['Task','Expected output','Planned date','Status'],pendingRows):empty('No pending tasks planned in this period.'))+
 panel('Department workload',groups.size?table(['Department','Completed tasks','Completed points'],[...groups].map(([name,g])=>`<tr><td>${e(name)}</td><td>${g.count}</td><td>${g.points}</td></tr>`)):empty('No completed workload in this period.'))+
 panel('Project milestones',projectRows.length?table(['Project','Completed','Pending'],projectRows):empty('No project-based tasks in this period.'))+
 panel('Business impact',kpis.size?table(['Department','KPI','Unit','Rollup','Target','Actual'],[...kpis.values()].map(k=>`<tr><td>${e(k.department)}</td><td>${e(k.label)}</td><td>${e(k.unit||'—')}</td><td>${e(k.rollup)}</td><td>${showKpi(k.target,k.rollup)}</td><td>${showKpi(k.actual,k.rollup)}</td></tr>`)):empty('Record a KPI and its result on a completed task to see it here.'));
 $('#performance-date').onchange=event=>{if(event.target.value){performanceDate=event.target.value;render();}};
}

let lastWorkspaceInteraction=Date.now();
for(const event of ['pointerdown','keydown','touchstart','scroll']){
 document.addEventListener(event,()=>{lastWorkspaceInteraction=Date.now()},{passive:true,capture:true});
}
async function sendWorkspacePresence(){
 if(!data||document.visibilityState!=='visible'||Date.now()-lastWorkspaceInteraction>90000)return;
 const section=nav.find(item=>item.pages.includes(page==='Projects'&&isOnboardingProject(data.projects.find(project=>project.id===projectSelection))?'Lead Tasks':page))?.name;
 if(!section)return;
 try{await fetch('/api/presence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({section})});}catch{}
}
const presencePanelPlaceholder=()=>panel('ERP activity today','<div id="team-presence" aria-live="polite"><p class="item">Loading activity…</p></div>');
async function refreshPresencePanel(){
 const target=$('#team-presence');
 if(!target)return;
 try{
  const response=await fetch('/api/presence');
  if(!response.ok)throw Error('Could not load workspace activity.');
  const {people}=await response.json();
  if(!target.isConnected)return;
  const active=person=>Date.now()-Number(person.last_seen)<120000;
  target.innerHTML='<p class="item">Approximate activity in this ERP. An IP may be shared by several people or change between networks.</p>'+
   (people.length?table(['Person','Activity','Last section','Time by section','Last IP'],people.map(person=>{
    const peers=people.filter(other=>other!==person&&active(other)&&other.ip);
    const different=person.ip&&active(person)&&peers.length&&!peers.some(other=>other.ip===person.ip);
    const time=Object.entries(person.minutes_by_section||{}).map(([name,minutes])=>e(name)+' '+Number(minutes)+'m').join(' · ');
    return `<tr><td>${e(person.name)}</td><td>${active(person)?'Active':'Last seen '+clock(Number(person.last_seen))}</td><td>${e(person.section)}</td><td>${time||'—'}</td><td>${e(person.ip||'—')}${different?'<small>Different from active teammates</small>':''}</td></tr>`;
   })):empty('No ERP activity recorded today.'));
 }catch(error){if(target.isConnected)target.innerHTML=empty(e(error.message));}
}
