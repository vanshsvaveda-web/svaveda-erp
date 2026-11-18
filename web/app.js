const $=s=>document.querySelector(s), ui=$('#view'), modal=$('#modal');
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const day=(offset=0,now=Date.now())=>new Date(Number(now)+(330+offset*1440)*60000).toISOString().slice(0,10);
function greeting(now=new Date()){
 const hour=new Date(Number(now)+330*60000).getUTCHours();
 return hour<12?'Good morning':hour<17?'Good afternoon':'Good evening';
}
const id=()=>crypto.randomUUID();
const fresh=()=>({
 people:[{name:'Vansh',team:'Management',role:'Administrator'}],
 leads:[],tasks:[],projects:[],events:[],attendance:{},messages:[],reviews:[]
});
let personalTaskScope=false, taskView="List", expertView='List';
let data, revision=0, committed, busy=false, role, currentName, roleSeats;
const isEmployee=()=>role==='Employee';
const isFounder=()=>role==='Founder';
const isSuperAdmin=()=>role==='Super Admin';
let leadPage=1;
let page='My Day',filter='All leads',query='',taskFilter='Open',selected=new Set(),toastTimer;
const nav=[
 {name:'Home',icon:'⌂',pages:['Overview','My Day','Review Queue','Inbox','Calendar']},
 {name:'Daily Operations',icon:'☷',pages:['Tasks','Projects']},
 {name:'Lead Generation',icon:'◎',pages:['Expert Leads','Pipeline','Lead Tasks']},
 {name:'People',icon:'♙',pages:['Employees','Attendance','Performance']},
 {name:'Messages',icon:'✉',pages:['Messages']},
 {name:'Settings',icon:'⚙',pages:['Integrations','Roles & Access']}
];
const isOnboardingProject=project=>project&&(project.id==='expert-onboarding'||project.name?.trim().toLowerCase()==='expert onboarding');
const isLeadTask=task=>Boolean(task.lead||data.projects.some(project=>project.id===task.projectId&&isOnboardingProject(project)));
function leadGenerationTabs(active){
 return `<div class="panel"><div class="toolbar filter-tabs" aria-label="Lead Generation views">${[['Leads','Expert Leads'],['Pipeline','Pipeline'],['Lead tasks','Lead Tasks']].map(([label,key])=>`<button type="button" data-act="nav" data-key="${key}" aria-pressed="${active===key}">${label}</button>`).join('')}</div></div>`;
}
const statuses=['New','Contacted','Follow-up','Interested','Registered','Verified','Program listed','Onboarded','Not reachable','Not interested','Invalid number','Do not contact'];
const actions=['Initial call','Send details','Follow-up','Schedule meeting','Collect documents','Verify documents','Registration','Program listing','Complete onboarding'];
const taskStatuses=['To do','In progress','Blocked','In review','Rework','Done'];
async function save(command){
 const response=await fetch('/api/workspace',{
  method:'PUT',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({revision,data,command})
 });
 const result=await response.json();
 if(!response.ok)throw Error(result.error||'The changes could not be saved.');
 revision=result.revision;
 if(result.data)data=result.data;
 committed=structuredClone(data);
 setTimeout(processSheetQueue,0);
}
async function load(){
 try{
  const response=await fetch('/api/workspace');
  const result=await response.json();
  if(!response.ok)throw Error(result.error||'Unable to open the workspace.');
  data=result.data||fresh();
  revision=result.revision;
  role=result.role;currentName=result.name;roleSeats=result.seats;
  if(isFounder()&&page==='My Day')page='Overview';
  committed=structuredClone(data);
  $('#jump').disabled=false;
  $('#desktop-alerts').disabled=false;
  $('#quick').disabled=false;$('#quick').hidden=isEmployee();
  if(isEmployee()&&page==='Overview')page='My Day';
  render();
  void refreshAlerts();
  void processSheetQueue().finally(autoPullSheet);
 }catch(error){
  ui.innerHTML='<div class="panel"><div class="empty">'+e(error.message)+' <button id="retry">Retry</button></div></div>';
  $('#retry').onclick=load;
 }
}
function notify(message){$('#toast').textContent=message;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').textContent='',3200)}
const nameOptions=(value='',blank='Select employee')=>options([blank,...new Set([...data.people.map(p=>p.name),...(roleSeats||[]).filter(p=>p.email).map(p=>p.name)])],value,blank);
function options(list,value,blank){return list.map(x=>'<option '+(x===blank?'value="" ':'')+(x===value?'selected':'')+'>'+e(x)+'</option>').join('')}
const input=(label,name,value='',type='text',required=false)=>`<label>${label}<input name="${name}" type="${type}" value="${e(value)}" ${required?'required':''}></label>`;
const select=(label,name,opts)=>`<label>${label}<select name="${name}">${opts}</select></label>`;
const area=(label,name,value='')=>`<label>${label}<textarea name="${name}">${e(value)}</textarea></label>`;
function assigneePicker(record){
 const selected=assignees(record);
 const people=[...new Set([...selected,currentName,...data.people.map(p=>p.name),...(roleSeats||[]).filter(p=>p.email).map(p=>p.name)].filter(Boolean))];
 return `<fieldset class="assignee-picker"><legend>Assign to</legend>${people.map(name=>`<label><input type="checkbox" name="owners" value="${e(name)}" ${selected.includes(name)?'checked':''}>${e(name)}</label>`).join('')}</fieldset>`;
}
const assigneeLinks=record=>assignees(record).map(ownerLink).join(', ')||'Unassigned';
const btn=(label,act,key='',primary=false)=>`<button type="button" class="${primary?'primary':''}" data-act="${act}" data-key="${e(key)}">${label}</button>`;
const pill=t=>{
 const tones={Done:'good',Onboarded:'good',Approved:'good','In progress':'blue',Contacted:'blue','In review':'violet','Follow-up':'violet',Pending:'amber',Blocked:'rose',Rework:'rose',Returned:'rose','Do not contact':'rose'};
 return `<span class="pill ${tones[t]||'neutral'}">${e(t)}</span>`;
};
const empty=t=>`<div class="empty">${t}</div>`;
const title=(name,desc,action='')=>`<div class="row"><div><h1>${name}</h1><p>${desc}</p></div><div class="actions">${action}</div></div>`;
const listItem=(name,desc,action='')=>`<div class="item row" style="margin:0"><div><strong>${e(name)}</strong><p>${e(desc)}</p></div>${action}</div>`;
const panel=(name,html)=>`<article class="panel"><h2>${name}</h2>${html}</article>`;
const table=(heads,rows)=>`<table><thead><tr>${heads.map(h=>'<th>'+h+'</th>').join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
function restoreDraft(target,saved){
 for(const key of Object.keys(target)){
  if(!Object.hasOwn(saved,key))delete target[key];
 }
 for(const [key,value] of Object.entries(saved)){
  const current=target[key];
  if(Array.isArray(current)&&Array.isArray(value)){
   const byId=new Map(current.filter(item=>item&&typeof item==='object'&&item.id).map(item=>[item.id,item]));
   target[key]=value.map((item,i)=>{
    const existing=item&&typeof item==='object'?(item.id?byId.get(item.id):current[i]):null;
    if(existing&&typeof existing==='object'&&!Array.isArray(existing)&&!Array.isArray(item)){
     restoreDraft(existing,item);return existing;
    }
    return structuredClone(item);
   });
  }else target[key]=structuredClone(value);
 }
}
function form(title,fields,submit,handler,size='regular'){
 modal.innerHTML=`<form class="popup-form ${size==='compact'?'popup-compact':''}"><div class="popup-heading"><h2 id="record-dialog-title">${title}</h2><button type="button" class="popup-close" id="cancel" aria-label="Close">×</button></div><div class="popup-fields">${fields}<p role="alert" id="error"></p></div><div class="popup-actions"><button type="button" id="cancel-form">Cancel</button><button class="primary">${submit}</button></div></form>`;
 $('#cancel').onclick=$('#cancel-form').onclick=()=>{if(!busy)modal.close()};
 modal.querySelector('form').onsubmit=async event=>{
  event.preventDefault();if(busy)return;
  const button=event.currentTarget.querySelector('.primary'), error=$('#error');
  button.disabled=true;busy=true;error.textContent='';
  try{
   const values=new FormData(event.currentTarget);
   const fields=Object.fromEntries(values);
   if(event.currentTarget.querySelector('.assignee-picker')) fields.owners=values.getAll('owners');
   const command=await handler(fields);
   await save(command);
   modal.close();render();notify('Saved');
  }catch(problem){
   restoreDraft(data,committed);
   error.textContent=problem.message;
   error.scrollIntoView({block:'nearest'});
  }finally{busy=false;button.disabled=false}
 };
 modal.showModal();
 modal.querySelector('.popup-fields input:not([type=file]),.popup-fields select,.popup-fields textarea')?.focus();
}
modal.addEventListener('cancel',event=>{if(busy)event.preventDefault()});
const duration=ms=>Math.floor(ms/3600000)+'h '+Math.floor(ms/60000)%60+'m';
const clock=ms=>ms?new Date(ms).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'}):'—';
function attendanceCard(){
 const a=data.attendance[day()]||{};
 const state=a.out?'Checked out':a.pause?'On break':a.in?'Checked in':'Ready to check in';
 const work=a.in?duration(Math.max(0,(a.out||Date.now())-a.in-(a.breakMs||0)-(a.pause?Date.now()-a.pause:0))):'0h 0m';
 return `<div class="item"><strong>${state}</strong><p>Check-in ${clock(a.in)} · Worked ${work}</p><div class="actions">${a.out?'':!a.in?btn('Check in','attendance','in',true):btn(a.pause?'End break':'Start break','attendance','break')+btn('Check out','attendance','out',true)}</div></div>`;
}
const taskRows=tasks=>tasks.length?tasks.map(t=>`<div class="item task-line"><div><button class="link task-name" data-act="task" data-key="${e(t.id)}">${e(t.title)}</button><small>${[assigneeLabel(t)||'Unassigned',t.due?'Due '+t.due:'No due date',t.priority].filter(Boolean).map(e).join(' · ')}</small></div>${pill(t.status)}</div>`).join(''):empty('No tasks in this view.');
let dayTaskQueue, agendaDate, fullCalendarOpen=false;
function renderPersonal(){
 const today=day(), mine=data.tasks.filter(task=>assignedTo(task,currentName));
 const active=mine.filter(task=>!['Done','In review'].includes(task.status));
 const overdue=active.filter(task=>task.due&&task.due<today);
 const current=active.filter(task=>!overdue.includes(task)&&(task.status==='Rework'||!task.due||task.due===today));
 const upcoming=active.filter(task=>task.due>today&&task.status!=='Rework').sort((a,b)=>a.due.localeCompare(b.due));
 const queues={Today:current,Overdue:overdue,Upcoming:upcoming,Review:mine.filter(task=>task.status==='In review')};
 dayTaskQueue||=current.length?'Today':overdue.length?'Overdue':'Today';
 const visible=queues[dayTaskQueue];
 const operations=visible.filter(task=>!isLeadTask(task)), leadTasks=visible.filter(isLeadTask);
 const followUps=data.leads.filter(lead=>assignedTo(lead,currentName)&&lead.due&&lead.due<=today&&!['Do not contact','Not interested','Invalid number','Onboarded','Program listed'].includes(lead.status));
 const date=calLabel(today,{dateStyle:'full'});
 const tabs=Object.entries(queues).map(([label,items])=>`<button data-act="day-work-filter" data-key="${label}" aria-pressed="${dayTaskQueue===label}">${label} <span class="tab-count">${items.length}</span></button>`).join('');
 ui.innerHTML=`<div class="personal-heading"><div><div class="day-date">${e(date)} · IST</div><h1>${greeting()}, ${e(currentName)}.</h1></div><div class="actions">${btn('Full calendar','personal-calendar')}${isEmployee()?btn('Request leave','ops-request','Leave',true):btn('＋ New task','task','',true)}</div></div>
 <div class="split home-columns day-workspace"><div>
 ${panel('Daily operations',`<div class="toolbar filter-tabs" aria-label="My work filters">${tabs}</div>`+(operations.length?operations.map(dayTaskRow).join(''):empty('No operations tasks in this queue.'))+`<div class="panel-foot">${btn('All my operations tasks','personal-tasks','Mine')}</div>`)}
 ${panel('Lead generation',leadTasks.length?leadTasks.map(dayTaskRow).join('')+`<div class="panel-foot">${btn('My lead tasks','personal-lead-tasks','Mine')}</div>`:empty('No lead tasks in this queue.')+`<div class="panel-foot">${btn('My lead tasks','personal-lead-tasks','Mine')}</div>`)}
 ${followUps.length?panel('Expert follow-ups due',followUps.slice(0,6).map(lead=>listItem(lead.name,'Due '+lead.due,btn('Follow up','outcome',lead.id))).join('')):''}
 </div>
 <div>${notificationPanel()}${panel('My schedule',dayAgenda())}
 ${isFounder()?'':panel('My attendance',attendanceCard())}</div></div>
 <details class="day-secondary"><summary>Requests${isEmployee()?'':' and reviews'}</summary>
 <div class="split"><div>${personalRequests()}</div><div>
 ${!isEmployee()?panel('Pending reviews',reviewRows().slice(0,3).map(item=>listItem(item.title,item.owner||'Unassigned',btn('Review','ops-decision',item.kind+'|'+item.id))).join('')||empty('Nothing waiting for review.')):''}
 </div></div></details>`;
}
function dayTaskRow(task){
 const running=Boolean(task.timer);
 const canStart=['To do','In progress','Rework'].includes(task.status);
 return `<div class="item task-line"><div><button class="link task-name" data-act="task" data-key="${e(task.id)}">${e(task.title)}</button><small>${e([task.due?'Due '+task.due:'No due date',task.priority].filter(Boolean).join(' · '))}</small></div><div class="actions">${pill(task.status)}${canStart?btn(running?'Pause':task.status==='In progress'?'Resume':'Start','day-task-timer',task.id):''}</div></div>`;
}
function dayAgenda(){
 const today=day();
 agendaDate||=today;
 const week=weekStart(agendaDate);
 const days=Array.from({length:7},(_,index)=>calDay(week,index));
 const entries=calendarEntries().filter(item=>item.date===agendaDate&&(assignedTo(item,currentName)||item.action==='event'&&!item.owner)).sort((a,b)=>(a.time||'99').localeCompare(b.time||'99'));
 return `<div class="day-agenda"><div class="agenda-week">${btn('‹','agenda-week','-7')}<strong>${e(calLabel(agendaDate,{month:'long',year:'numeric'}))}</strong>${btn('›','agenda-week','7')}${btn('Today','agenda-date',today)}</div><div class="date-strip">${days.map(date=>`<button data-act="agenda-date" data-key="${date}" aria-label="${e(calLabel(date,{dateStyle:'full'}))}" aria-pressed="${date===agendaDate}"><small>${e(calLabel(date,{weekday:'short'}))}</small><strong>${Number(date.slice(-2))}</strong></button>`).join('')}</div>
 <div class="agenda-items">${entries.map(item=>`<div class="agenda-row"><span class="agenda-time">${item.time?e(eventTime(item.time)):item.category==='Task'||item.category==='Follow-up'?'Due':'All day'}</span><div><button class="link" data-act="${item.action}" data-key="${e(item.id)}">${e(item.title)}</button><small>${e(item.category)}</small></div></div>`).join('')||empty('Nothing scheduled for this day.')}</div>
 ${isEmployee()?'':`<div class="panel-foot">${btn('＋ Add event','cal-add',agendaDate)}</div>`}</div>`;
}
function renderHome(open,unassigned,due){
 const today=day();
 const tasks=open.filter(task=>!isLeadTask(task)).sort((a,b)=>(a.status!=='Rework')-(b.status!=='Rework')||(a.due||'9999').localeCompare(b.due||'9999'));
 const followUps=due;
 const meetings=data.events.filter(item=>item.date===today&&item.category!=='Holiday').sort((a,b)=>(a.time||'').localeCompare(b.time||''));
 const bars=[
  ['Open tasks',tasks.length,'Tasks','blue','✓'],
  ['Follow-ups due',followUps.length,'Expert Leads','violet','◎'],
  ['Unassigned leads',unassigned.length,'Unassigned','amber','◎'],
  ['Awaiting review',reviewRows().length,'Review Queue','green','›']
 ];
 const date=new Intl.DateTimeFormat('en-IN',{dateStyle:'full',timeZone:'Asia/Kolkata'}).format(new Date());
 ui.innerHTML=`<div class="overview-heading"><div><div class="day-date">${e(date)}</div><h1>Workspace overview</h1></div><div class="actions">${btn('Review queue','nav','Review Queue')}${btn('＋ New task','task','',true)}</div></div>
 <div class="snapshot">${bars.map(([label,value,target,color,icon])=>`<button class="snapshot-card" data-act="home-link" data-key="${target}" data-label="${label}"><span class="snapshot-icon ${color}" aria-hidden="true">${icon}</span><span class="snapshot-label">${label}</span><strong>${value}</strong><span class="snapshot-arrow" aria-hidden="true">›</span></button>`).join('')}</div>
 <div class="split home-columns"><div>${panel('Team tasks',taskRows(tasks.slice(0,6))+`<div class="panel-foot">${btn('View tasks','nav','Tasks')}</div>`)}${panel('Expert follow-ups',followUps.slice(0,6).map(l=>listItem(l.name,l.owner||'Unassigned',btn('Follow up','outcome',l.id))).join('')||empty('No follow-ups due.'))}</div>
 <div>${notificationPanel()}${isFounder()?'':panel('Attendance',attendanceCard())}${panel('Today’s meetings',meetings.map(item=>listItem(item.title,[eventTime(item.time),item.owner].filter(Boolean).join(' · '),btn('Open','event',item.id))).join('')||empty('No meetings today.'))}</div></div>`;

}

function render(){
 const module=nav.find(item=>item.pages.includes(page==='Projects'&&isOnboardingProject(data.projects.find(project=>project.id===projectSelection))?'Lead Tasks':page));
 $('aside footer').innerHTML=`<span class="profile-avatar">${e(currentName.split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase())}</span><span class="profile-label"><strong>${e(currentName)}</strong><small>${e(role)}</small></span>`;
 const entries=[[isFounder()?'Overview':'My Day','◷','Home'],['Expert Leads','◎','Lead Generation'],['Tasks','☷','Daily Operations'],['Messages','✉','Messages'],['Attendance','♙','People'],['Integrations','⚙','Settings']];
 const labels={'Expert Leads':'Lead Generation',Tasks:'Daily Operations',Attendance:isEmployee()?'Attendance':'Team',Integrations:'Settings'};
 $('nav').innerHTML=entries.filter(([name])=>name!=='Integrations'||isSuperAdmin()).map(([name,icon,group])=>{
  const active=module.name===group;
  return `<button ${active?'class="active" aria-current="page"':''} data-act="nav" data-key="${name}"><i aria-hidden="true">${icon}</i>${labels[name]||name}</button>`;
 }).join('');
 $('#subnav').hidden=true;
 $('#crumb').textContent=module.name===page?page:module.name+' / '+page;
 const open=data.tasks.filter(t=>t.status!=='Done'), unassigned=data.leads.filter(l=>!l.owner), due=data.leads.filter(l=>l.due&&l.due<=day()&&!['Do not contact','Not interested','Onboarded','Invalid number'].includes(l.status));
 if(page==='Calendar')page='My Day';
 if(page==='My Day'||page==='Overview'&&isEmployee()){renderPersonal();ui.insertAdjacentHTML('beforeend',`<details id="calendar-detail" class="day-secondary" ${fullCalendarOpen?'open':''}><summary>Full calendar</summary><div id="my-calendar"></div></details>`);
  $('#calendar-detail').ontoggle=event=>{fullCalendarOpen=event.target.open};
  calendar();return}
 if(page==='Overview'){
  renderHome(open,unassigned,due);
  return;
 }
 if(page==='Inbox'){renderInbox();return}
 if(page==='Pipeline'){renderPipeline();return}
 if(page==='Expert Leads'&&expertView==='Pipeline'){renderPipeline();return}
 if(page==='Expert Leads'){
 const queues={
 'All leads':data.leads,'Unassigned':unassigned,'Assigned':data.leads.filter(lead=>lead.owner),
 'My leads':data.leads.filter(lead=>assignedTo(lead,currentName)),'Follow-ups':due
 };
 const visible=queues[filter].filter(lead=>[lead.name,lead.phone,lead.area,lead.instagram,assigneeLabel(lead),leadColumn(lead,'Brand / Organisation'),leadColumn(lead,'City')].join(' ').toLowerCase().includes(query.toLowerCase()));
 const tabs=(isEmployee()?['My leads','Follow-ups']:['All leads','My leads','Unassigned','Assigned','Follow-ups']).map(name=>
 `<button data-act="lead-filter" data-key="${name}" aria-pressed="${name===filter}">${name==='Follow-ups'?'Follow-ups due':name} <span class="tab-count">${queues[name].length}</span></button>`).join('');
 const pageSize=25;
 const totalPages=Math.max(1,Math.ceil(visible.length/pageSize));
 leadPage=Math.min(leadPage,totalPages);
 const start=(leadPage-1)*pageSize, shown=visible.slice(start,start+pageSize);
 const checkbox=!isEmployee();
 const allChecked=shown.length&&shown.every(lead=>selected.has(lead.id));
 const heads=[
  ...(checkbox?['<input id="all" type="checkbox" aria-label="Select leads on this page" '+(allChecked?'checked':'')+'>']:[]),
  'Expert','Stage','Assigned to','Next action','Actions'
 ];
 const rows=shown.map(lead=>{
  const context=[leadColumn(lead,'Brand / Organisation'),leadColumn(lead,'City'),lead.area].filter(Boolean).join(' · ');
  const due=lead.due?'Due '+lead.due:'';
  return `<tr>${checkbox?`<td><input type="checkbox" aria-label="Select ${e(lead.name)}" data-check="${e(lead.id)}" ${selected.has(lead.id)?'checked':''}></td>`:''}
  <td><button class="link lead-name" data-act="lead" data-key="${e(lead.id)}">${e(lead.name)}</button>${context||lead.phone?`<small>${e(context||lead.phone)}</small>`:''}</td>
  <td>${pill(lead.status)}</td><td>${assigneeLinks(lead)}</td>
  <td>${lead.action?`<strong>${e(lead.action)}</strong><small>${loggedFollowUps(lead).length} follow-ups logged</small>`:'<span class="muted">—</span>'}${due?`<small>${e(due)}</small>`:''}</td>
  <td><div class="lead-row-actions">${checkbox?btn(lead.owner?'Reassign':'Assign','assign',lead.id):''}${btn('Follow up','outcome',lead.id)}</div></td></tr>`;
 });
 const caption=visible.length?`Showing ${start+1}–${start+shown.length} of ${visible.length}`:'0 leads';
 const pager=`<div class="lead-pagination"><span>${caption}</span><div><button data-act="lead-page" data-key="-1" ${leadPage===1?'disabled':''}>Previous</button><span>${leadPage} / ${totalPages}</span><button data-act="lead-page" data-key="1" ${leadPage===totalPages?'disabled':''}>Next</button></div></div>`;
 ui.innerHTML=title('Lead Generation','Manage assignments, outreach and onboarding.',(isEmployee()?'':(isSuperAdmin()?btn('Import from Sheet','nav','Integrations'):btn('Import CSV','import'))+btn('＋ Quick capture','quick-lead','',true)+btn('Add lead','lead')))+leadGenerationTabs('Expert Leads')+
 `<section class="panel leads-panel"><div class="toolbar"><input id="search" aria-label="Search leads" placeholder="Search experts, cities, or owners" value="${e(query)}"><span class="results-count">${visible.length} ${visible.length===1?'lead':'leads'}</span>${checkbox?btn('Export CSV','export'):''}</div><div class="filter-tabs lead-tabs" aria-label="Lead filters">${tabs}</div>${checkbox&&selected.size?`<div class="bulk-toolbar"><strong>${selected.size} selected</strong>${btn('Clear','lead-clear')}${btn('Assign selected','assign','',true)}</div>`:''}
 ${shown.length?`<div class="lead-table-scroll ${checkbox?'with-selection':''}">${table(heads,rows)}</div>${pager}`:empty('No leads match this view.')}</section>`;
 $('#search').oninput=event=>{query=event.target.value;leadPage=1;selected.clear();const pos=event.target.selectionStart;render();$('#search').focus();$('#search').setSelectionRange(pos,pos)};
 if($('#all'))$('#all').onchange=event=>{shown.forEach(lead=>event.target.checked?selected.add(lead.id):selected.delete(lead.id));render()};

 }
 if(page==='Tasks'||page==='Lead Tasks'){
 const leadView=page==='Lead Tasks';
 const scope=data.tasks.filter(task=>isLeadTask(task)===leadView&&(!personalTaskScope||assignedTo(task,currentName)));
 const waiting=task=>task.status!=='Done'&&task.status!=='In review';
 const tasks=scope.filter(t=>taskFilter==='All'||taskFilter==='Open'&&t.status!=='Done'||
 taskFilter==='Mine'&&t.status!=='Done'&&assignedTo(t,currentName)||
 taskFilter==='Today'&&waiting(t)&&(t.status==='Rework'||!t.due||t.due<=day())||
 taskFilter==='Review'&&t.status==='In review'||
 taskFilter==='Overdue'&&waiting(t)&&t.due&&t.due<day()||
 taskFilter==='Completed'&&t.status==='Done');
 const filters=personalTaskScope?['Mine','Today','Overdue','Review','Completed']:['Open','Today','Overdue','Review','Completed','All'];
 const taskViewContent=items=>{
  if(taskView==='Board')return taskBoard(items);
  if(taskView==='List')return table(['Task','Assignee','Due date','Points','Status'],items.map(t=>`<tr><td>${btn(e(t.title),'task',t.id)}</td><td>${assigneeLinks(t)}</td><td>${e(t.due||'—')}</td><td>${taskPoints(t)||'—'}</td><td>${pill(t.status)}</td></tr>`));
  const dated=items.filter(task=>task.due).sort((a,b)=>a.due.localeCompare(b.due));
  const days=[...new Set(dated.map(task=>task.due))];
  const undated=items.filter(task=>!task.due);
  return days.map(date=>`<div class="task-date-group"><h3>${e(calLabel(date,{weekday:'long',day:'numeric',month:'short'}))}</h3>${taskRows(dated.filter(task=>task.due===date))}</div>`).join('')+
   (undated.length?`<div class="task-date-group"><h3>No due date</h3>${taskRows(undated)}</div>`:'');
 };
 const projects=new Map(data.projects.map(project=>[project.id,project]));
 const standalone=tasks.filter(task=>!projects.has(task.projectId));
 const groups=[...projects].map(([key,project])=>({project,items:tasks.filter(task=>task.projectId===key)})).filter(group=>group.items.length);
 const grouped=groups.map(({project,items})=>`<details class="work-project-group"><summary><strong>${e(project.name)}</strong><span>${items.length} ${items.length===1?'task':'tasks'}</span></summary><div class="toolbar">${btn('Open project','ops-project',project.id)}</div>${taskViewContent(items)}</details>`).join('');
 const section=leadView?'Lead tasks':'Daily operations';
 const controls=leadView?(isEmployee()?'':btn('＋ Quick capture','quick-lead','',true)):
   btn('Projects','ops-project')+btn('Performance','nav','Performance')+(isEmployee()?'':btn('＋ New task','task','',true));
 ui.innerHTML=title(personalTaskScope?'My '+section.toLowerCase():section,
 leadView?'Work on expert research and outreach.':'Manage day-to-day tasks and operational projects.',controls)+
 (leadView?leadGenerationTabs('Lead Tasks'):'')+
 `<div class="panel"><div class="toolbar view-toolbar"><div class="filter-tabs" aria-label="Task filters">${filters.map(name=>`<button data-act="task-tab" data-key="${name}" aria-pressed="${name===taskFilter}">${name==='Mine'?'All open':name}</button>`).join('')}</div><div class="segments" aria-label="Task view">${['List','Board','Due dates'].map(name=>`<button data-act="task-view" data-key="${name}" aria-pressed="${name===taskView}">${name}</button>`).join('')}</div></div>${grouped}${standalone.length?taskViewContent(standalone):tasks.length?'':empty('No tasks match this filter.')}</div>`;

 }
 if(page==='Review Queue'){renderReviewQueue();return}
 if(page==='Projects'){renderProjects();return}

 if(page==='Attendance'&&isFounder())ui.innerHTML=title('Team','Manage team workload and availability.',btn('Approvals','nav','Review Queue'))+teamDirectory();
 else if(page==='Attendance')ui.innerHTML=title(isEmployee()?'Attendance':'Team','Track check-ins, breaks and working hours.',btn('New request','ops-request'))+panel('Today',attendanceCard())+panel('Attendance history',table(['Date','Check-in','Check-out','Working time'],Object.entries(data.attendance).sort().reverse().map(([d,a])=>`<tr><td>${d}</td><td>${clock(a.in)}</td><td>${clock(a.out)}</td><td>${a.out?duration(a.out-a.in-(a.breakMs||0)):'In progress'}</td></tr>`)))+personalRequests()+teamDirectory()+teamPerformance();
 if(page==='Employees'){page='Attendance';render();return}
 if(page==='Performance'){renderTaskPerformance();return}
 if(page==='Messages')renderMessages();
 if(page==='Roles & Access'||page==='Integrations'){
  page='Integrations';
  renderRoles();
  const access=[...ui.children].slice(1);
  renderIntegrations();
  ui.append(...access);
 }
}
function makeTask(l){
 const active=data.tasks.filter(t=>t.lead===l.id&&t.status!=='Done');
 if(!l.owner||!l.action||['Do not contact','Not interested','Invalid number','Onboarded'].includes(l.status)){active.forEach(t=>t.status='Done');return}
 const fields={title:l.action+' · '+l.name,owner:l.owner,owners:assignees(l),due:l.due,priority:l.priority||'Medium',note:l.instructions||'',lead:l.id};
 if(active.length)Object.assign(active[0],fields);else data.tasks.unshift({id:id(),status:'To do',...fields});
}
const normalized=s=>s.replace(/\D/g,'').replace(/^91(?=\d{10}$)/,'');
function setLead(l,v){
 v.name=v.name.trim();v.phone=v.phone.trim();
 const phone=normalized(v.phone);
 const instagram=leadInstagram(v.instagram);
 if(!v.name||((!l.quickCaptured||l.sheetSnapshot?.phone)&&!phone)||v.phone&&!phone)throw Error('Enter a name and a valid phone number.');
 if(v.instagram&&!instagram)throw Error('Enter an Instagram @handle or profile link.');
 if(data.leads.some(x=>x.id!==l.id&&((phone&&normalized(x.phone||'')===phone)||
   (instagram&&instagram===leadInstagram(x.instagram||leadColumn(x,'IG (Personal)'))))))throw Error('An expert lead already uses this phone or Instagram profile.');
 v.instagram=instagram;
 Object.assign(l,v);setAssignees(l,v.owners);if(!data.leads.includes(l))data.leads.unshift(l);makeTask(l);
}
const reader=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve({name:file.name,url:r.result});r.onerror=()=>reject(Error('Unable to read attachment.'));r.readAsDataURL(file)});
async function attach(file){if(!file?.size)return null;if(file.size>700000)throw Error('Attachments must be smaller than 700 KB.');return reader(file)}
const download=f=>f?`<p><a download="${e(f.name)}" href="${e(f.url)}">${e(f.name)}</a></p>`:'';
function csvRows(text){
 const rows=[];let row=[],field='',quoted=false;
 for(let i=0;i<text.length;i++){
 const c=text[i];
 if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++}else quoted=!quoted}
 else if(!quoted&&c===','){row.push(field);field=''}
 else if(!quoted&&(c==='\n'||c==='\r')){if(c==='\r'&&text[i+1]==='\n')i++;rows.push([...row,field]);row=[];field=''}
 else field+=c;
 }
 if(quoted)throw Error('A quoted CSV field is incomplete.');
 if(row.length||field)rows.push([...row,field]);return rows;
}
function importCsv(text,source='Sheet CSV'){
 const rows=csvRows(text.replace(/^\uFEFF/,''));
 const names=['nameexpert','expertname','name','fullname','expertfullname','contactname','nameoftheexpert','name of expert'].map(headerKey);
 const phones=['contactnumbergeneral','phonenumber','phone','mobile','mobilenumber','contactnumber','contactnum','contactnumgeneral','contactno','phoneno','mobileno','whatsappnumber','whatsappno','generalcontactnumber','contactphone','number','telephone','telephone number'].map(headerKey);
 const rowIndex=rows.slice(0,35).findIndex(row=>{
  const keys=row.map(headerKey);
  return names.some(key=>keys.includes(key))&&phones.some(key=>keys.includes(key));
 });
 if(rowIndex<0)throw Error('No lead headers found in the first 35 rows. Open the leads tab itself and copy its link. Put Name (Expert) and Contact Number (General) on the same row.');
 const headers=rows[rowIndex].map(value=>value.trim()), heads=headers.map(headerKey);
 const find=(...keys)=>keys.map(key=>heads.indexOf(key)).find(index=>index>=0)??-1;
 const columns={name:find(...names),phone:find(...phones),owner:find('teammember','assignedto','assignee','owner'),action:find('nextaction','todo','task','action'),due:find('followupdate','duedate','nextfollowup'),status:find('status'),sheetStage:find('leadstatus','communicationstage'),sheetPipeline:find('pipelinestatus'),sheetInterest:find('interest'),method:find('lastcontactmethod','contactmethod'),area:find('specialization','area','keyword'),priority:find('priority'),instructions:find('instructions','todo'),note:find('remarks','notes')};
 const byPhone=new Map(data.leads.flatMap(lead=>[[normalized(lead.phone),lead],...(lead.sheetSnapshot?.phone?[[normalized(lead.sheetSnapshot.phone),lead]]:[])]));
 let added=0,skipped=0,updated=0;
 const seen=new Set();
 for(const row of rows.slice(rowIndex+1)){
 const fields=Object.fromEntries(Object.entries(columns).map(([k,i])=>[k,(row[i]||'').trim()]));
 if(!fields.name&&!fields.phone)continue;
 const phone=normalized(fields.phone);
 if(!fields.name||!phone||seen.has(phone)){skipped++;continue}
 seen.add(phone);
 const existing=byPhone.get(phone);
 if(existing&&source!=='Google Sheets'){skipped++;continue}
 const people=[...data.people,...(roleSeats||[]).filter(person=>person.email),{name:currentName}];
 const sheetOwner=fields.owner;
 setAssignees(fields,sheetOwner.split(/[,;\n]+/).flatMap(name=>{
  const person=people.find(item=>item.name.toLowerCase()===name.trim().toLowerCase());
  return person?[person.name]:[];
 }));
 const stageFields=['pipelinestatus','leadstatus','communicationstage','registrationstatus','status'];
 fields.status=stageFields.map(key=>statuses.find(status=>headerKey(status)===headerKey(row[heads.indexOf(key)]||''))).find(Boolean)||'New';
 fields.priority=['Low','Medium','High','Urgent'].find(priority=>priority.toLowerCase()===fields.priority.toLowerCase())||'Medium';
 fields.due=sheetDate(fields.due);
 const sheetFields=headers.slice(0,64).flatMap((header,i)=>{
  const value=(row[i]||'').trim();return header&&value?[[header.slice(0,100),value.slice(0,3000)]]:[];
 });
 if(!fields.action)fields.action=(row[heads.indexOf('todo')]||'').trim();
 if(fields.owner&&!fields.action)fields.action='Initial call';
 if(fields.owner&&!fields.due)fields.due=day();
 if(existing){
  if(data.sheetQueue?.[existing.id]){skipped++;continue;}
  const previous=existing.sheetSnapshot;
  if(previous&&columns.owner>=0&&assigneeLabel(existing)===assigneeLabel(previous))setAssignees(existing,fields.owners);
  for(const [key,value] of Object.entries(fields)){
   if(key==='owner'||key==='owners')continue;
   if(previous&&columns[key]>=0&&existing[key]===previous[key]&&value!==previous[key])existing[key]=value;
  }
  if(previous&&(assigneeLabel(previous)!==assigneeLabel(fields)||Object.keys(fields).some(key=>key!=='owner'&&key!=='owners'&&previous[key]!==fields[key]))){makeTask(existing);updated++}
  existing.sheetSnapshot={...fields,owner:sheetOwner};
  existing.sheetFields=sheetFields;
 }else{
  const lead={id:id(),source,sheetFields,...fields};
  if(source==='Google Sheets')lead.sheetSnapshot={...fields,owner:sheetOwner};
  data.leads.unshift(lead);
  byPhone.set(phone,lead);
  makeTask(lead);
  added++;
 }
 }
 return {added,skipped,updated};
}
document.addEventListener('change',ev=>{const key=ev.target.dataset.check;if(key){ev.target.checked?selected.add(key):selected.delete(key);render()}});
document.addEventListener('click',async ev=>{
 const b=ev.target.closest('[data-act]');if(!b)return;
 if(busy)return;
 const {act,key}=b.dataset;
 if(b.dataset.notificationId){markNotifications([b.dataset.notificationId]);b.closest('.notification-row')?.removeAttribute('data-unread');}
 if(act==='notifications-read'){markNotifications(activityAlerts(data).map(item=>item.id));render();return;}
 if(act==='desktop-enable'){void enableDesktopNotifications();return;}
 if(act==='sheet-disconnect'&&isSuperAdmin()){
  form('Disconnect Google Sheet','<p>Stop automatic pulls from this Sheet. Imported leads stay in the workspace.</p>','Disconnect',()=>{delete data.sheetLink;delete data.sheetSyncedAt;sheetError=''});
  return;
 }
 if(act==='desktop-inbox'){if(modal.open)modal.close();page='Inbox';render();return}

 if(act==='inbox-refresh'){await load();return}
 if(act==='template'&&!isEmployee()){chooseTemplate(key);return}
 if(act==='personal-tasks'||act==='personal-lead-tasks'){personalTaskScope=true;taskFilter=key;page=act==='personal-lead-tasks'?'Lead Tasks':'Tasks';render();return}
 if(act==='personal-calendar'||act==='nav'&&key==='Calendar'){
  page='My Day';fullCalendarOpen=true;
  calendarDate=agendaDate||day();
  render();$('#calendar-detail').scrollIntoView({block:'start'});return
 }
 if(act==='day-work-filter'){dayTaskQueue=key;render();return}
 if(act==='agenda-date'||act==='agenda-week'){
  agendaDate=act==='agenda-date'?key:calDay(agendaDate||day(),Number(key));render();return
 }
 if(act==='day-task-timer'){
  const task=data.tasks.find(item=>item.id===key&&assignedTo(item,currentName));
  if(!task||!['To do','In progress','Rework'].includes(task.status))return;
  busy=true;
  try{
   if(task.timer){task.elapsed=(task.elapsed||0)+Math.max(0,Date.now()-task.timer);delete task.timer}
   else {task.status='In progress';task.timer=Date.now()}
   await save();render();
  }catch(error){data=structuredClone(committed);notify(error.message)}
  finally{busy=false}
  return
 }
 if(act==='home-link'){
  personalTaskScope=false;
  expertView='List';leadPage=1;page=key==='Unassigned'?'Expert Leads':key;
  filter=key==='Unassigned'?'Unassigned':key==='Expert Leads'?'Follow-ups':isEmployee()?'My leads':'All leads';
  taskFilter=b.dataset.label==='Overdue tasks'?'Overdue':'Open';
  query='';selected.clear();render();return;
 }
 if(act==='expert-view'){expertView=key;page='Expert Leads';render();return}
 if(act==='lead-clear'){selected.clear();render();return}
 if(act==='lead-page'){leadPage=Math.max(1,leadPage+Number(key));render();return}
 if(act==='lead-filter'){leadPage=1;filter=key;selected.clear();render();return}
 if(act==='owner-work'){if(!isEmployee()||key===currentName)openOwnerWork(key);return}
 if(act==='performance-period'){performancePeriod=key;render();return}
 if(act==='task-view'){taskView=key;render();return}
 if(act==='task-tab'){taskFilter=key;render();return}

 if(act.startsWith('ops-')){operationsAction(act,key);return}
 if(act==='nav'&&key==='Review Queue'&&isEmployee())return;
 if(act==='nav'&&['Integrations','Roles & Access'].includes(key)&&!isSuperAdmin())return;
 if(act==='person'&&!isSuperAdmin())return;
 if(isEmployee()&&['assign','import','export','cal-add','cal-slot'].includes(act))return;
 if(isEmployee()&&!key&&['lead','task','project','event'].includes(act))return;
 if(act.startsWith('cal-')){calendarAction(act,key);return}
 if(act.startsWith('msg-')){messageAction(act,key);return}
 if(act==='nav'||act==='queue'){closeNavigation();if(key==='Tasks'||key==='Lead Tasks'){personalTaskScope=false;taskFilter='Open'}if(key==='Expert Leads'){expertView='List';leadPage=1}page=act==='queue'?'Expert Leads':key;filter=act==='queue'?'Unassigned':b.dataset.filter||(isEmployee()?'My leads':'All leads');query='';selected.clear();render();ui.focus({preventScroll:true});return}
 if(act==='attendance'&&!isFounder()){
 const a=data.attendance[day()]||={};
 const now=Date.now();
 if(key==='in')a.in=now;
 if(key==='break'&&!a.pause)a.pause=now;
 else if(a.pause){a.breakMs=(a.breakMs||0)+now-a.pause;delete a.pause}
 if(key==='out')a.out=now;
 busy=true;try{await save()}catch(error){data=structuredClone(committed);notify(error.message)}finally{busy=false;render()}return;
 }
 if(act==='quick-lead'&&!isEmployee()){openQuickLead();return;}
 if(act==='lead'){
 const l=data.leads.find(x=>x.id===key)||{id:id(),status:'New',source:'Manual'};
 const links=btn('Follow up','outcome',l.id);
 const handoff=l.researchReturnTo?'<p>Details assigned to '+e(assigneeLabel(l))+' · Returns to '+e(l.researchReturnTo)+'</p>':
  l.researchNotes?'<p><strong>Research notes:</strong> '+e(l.researchNotes)+'</p>':'';
 const history=key?handoff+followUpHistory(l):'';
 if(isEmployee()){readRecord(e(l.name),links+'<p>'+e([l.status,l.action,l.due].filter(Boolean).join(' · '))+'</p><p>'+e(l.instructions)+'</p>'+leadSheetDetails(l)+history);return}
 form(key?'Edit expert lead':'Add expert lead',input('Name','name',l.name,'text',true)+input('Phone','phone',l.phone,'tel',!l.quickCaptured||Boolean(l.sheetSnapshot?.phone))+input('Instagram','instagram',l.instagram)+input('Specialization','area',l.area)+select('ERP stage','status',options(statuses,l.status))+assigneePicker(l)+input('Next action','action',l.action)+input('Due date','due',l.due,'date')+area('Instructions','instructions',l.instructions)+
 (data.sheetLink||l.sheetSnapshot?select('Lead Status','sheetStage',options(['','Followup','Communication','Call Confirmed','Call Concluded'],l.sheetStage))+
 select('Pipeline Status','sheetPipeline',options(['','Hot','In Progress','Cold'],l.sheetPipeline))+
 select('Interest','sheetInterest',options(['','Yes','No','Maybe'],l.sheetInterest)):'')+leadSheetDetails(l)+history,
 'Save lead',v=>{if(v.owners.length&&!v.action)v.action='Initial call';if(v.owners.length&&!v.due)v.due=day();setLead(l,v)});

 }
 if(act==='assign'){
 const leads=data.leads.filter(l=>key?l.id===key:selected.has(l.id));
 if(!leads.length)return;
 form('Assign '+(key?e(leads[0].name):leads.length+' leads'),assigneePicker(key?leads[0]:{})+select('Task','action',options([...actions,'Custom'],leads[0].action))+input('Custom task title','custom')+input('Due date','due',key&&leads[0].due||day(),'date',true)+select('Priority','priority',options(['Low','Medium','High','Urgent'],'Medium'))+area('Instructions','instructions',leads[0].instructions),'Assign and create tasks',v=>{
 if(!v.owners.length)throw Error('Choose at least one assignee.');
 if(v.action==='Custom'&&!v.custom.trim())throw Error('Enter a custom task title.');
 const eligible=leads.filter(l=>!['Do not contact','Not interested','Invalid number','Onboarded'].includes(l.status));
 if(!eligible.length)throw Error('These leads are closed to outreach.');
 eligible.forEach(l=>{setAssignees(l,v.owners);Object.assign(l,{action:v.action==='Custom'?v.custom.trim():v.action,due:v.due,priority:v.priority,instructions:v.instructions});makeTask(l)});
 selected.clear();notify(eligible.length+' assigned'+(eligible.length<leads.length?' · Closed leads skipped':''))
 });
 }
 if(act==='outcome'){if(modal.open)modal.close();openLeadOutcome(key);return}
 if(act==='task'){
 if(modal.open)modal.close();
 const t=data.tasks.find(x=>x.id===key)||{id:id(),status:'To do',priority:'Medium',start:day(),due:day(),projectId:page==='Projects'?projectSelection:''};
 const researchLead=t.status!=='Done'&&t.lead&&data.leads.find(lead=>lead.id===t.lead&&lead.researchReturnTo&&assignedTo(lead,currentName));
 if(researchLead){openLeadResearch(researchLead);return;}
 if(isEmployee()){
  if(t.status==='Done'){readRecord(e(t.title),'<p>Completed</p><p>'+e(t.note)+'</p>'+taskResultsDetails(t)+download(t.file)+download(t.submission));return}
  form(e(t.title),'<p>'+e([t.due,t.priority,t.note].filter(Boolean).join(' · '))+'</p>'+taskResultsDetails(t)+download(t.file)+select('Status','status',options(['To do','In progress','Blocked','In review'],t.status==='Rework'?'In progress':t.status))+select('Timer','timerAction',options(['Keep current',t.timer?'Pause':'Start'],'Keep current'))+'<p>Tracked '+duration((t.elapsed||0)+(t.timer?Math.max(0,Date.now()-t.timer):0))+'</p>'+taskChecklist(t)+taskResultFields(t)+area('Work submission or comment','comment')+input('Submission attachment','submission','','file')+(t.submission?download(t.submission):'')+(t.comments||[]).map(c=>'<p>'+e(c)+'</p>').join(''),'Update task',async value=>{
   t.checklist=(t.checklist||[]).map((item,i)=>({...item,done:value['step'+i]==='on'}));
   const file=await attach(value.submission);if(file)t.submission=file;
   if(value.timerAction==='Start'&&value.status!=='In review')t.timer=Date.now();
   if((value.timerAction==='Pause'||value.status==='In review')&&t.timer){t.elapsed=(t.elapsed||0)+Math.max(0,Date.now()-t.timer);delete t.timer}
   t.status=value.status;
   for(const field of taskResultKeys)t[field]=value[field];
   if(value.comment.trim())(t.comments||=[]).push(value.comment.trim());
  });
  if(t.status!=='In review'){
   const submit=document.createElement('button');
   submit.type='button';submit.textContent='Submit for review';
   const taskForm=modal.querySelector('form');
   submit.onclick=()=>{taskForm.elements.status.value='In review';taskForm.requestSubmit()};
   modal.querySelector('.popup-actions').prepend(submit);
  }
  return;
 }
 const tracked=(t.elapsed||0)+(t.timer?Date.now()-t.timer:0);
 const details=select('Repeat after completion','repeat',options(['None','Daily','Weekly','Monthly'],t.repeat||'None'))+area('Checklist (one step per line)','checklistText',(t.checklist||[]).map(item=>item.text).join('\n'))+select('Priority','priority',options(['Low','Medium','High','Urgent'],t.priority))+select('Status','status',options(taskStatuses,t.status))+taskAmount('Estimated hours','hours',t.hours)+taskPlanFields(t)+taskResultFields(t)+taskResultsDetails(t)+area('Comment','comment')+(t.comments||[]).map(c=>'<p>'+e(c)+'</p>').join('')+input('Attachment','attachment','','file')+download(t.file);
 const fields=(!key?templateField():'')+input('Title','title',t.title,'text',true)+assigneePicker(t)+projectField(t.projectId)+input('Start date','start',t.start,'date')+input('Due date','due',t.due,'date')+area('Instructions','note',t.note);
 const tracker=key?`<p>Tracked ${duration(tracked)} · ${t.timer?'Running':'Paused'}</p>${select('Timer','timerAction',options(['Keep current',t.timer?'Pause':'Start'],'Keep current'))}`:'';
 form(key?'Task details':'New task',fields+`<details class="task-options" open><summary>Planning, results and attachments</summary><div class="task-options-grid">${details}${tracker}</div></details>`,'Save task',async v=>{
 if(v.repeat!=='None'&&!v.due)throw Error('Set a due date for the recurring task.');
 if(v.start&&v.due&&v.start>v.due)throw Error('The due date must be after the start date.');
 const f=await attach(v.attachment);if(f)t.file=f;
 if(v.timerAction==='Start')t.timer=Date.now();if(v.timerAction==='Pause'||v.status==='Done'){if(t.timer)t.elapsed=(t.elapsed||0)+Date.now()-t.timer;delete t.timer}
 if(v.comment.trim())(t.comments||=[]).push(v.comment.trim());
 t.checklist=v.checklistText.split('\n').map(text=>text.trim()).filter(Boolean).slice(0,30).map(text=>({text:text.slice(0,250),done:(t.checklist||[]).find(item=>item.text===text)?.done||false}));
 delete v.checklistText;delete v.attachment;delete v.timerAction;delete v.comment;Object.assign(t,v);setAssignees(t,v.owners);if(!key)data.tasks.unshift(t);notify('Task saved');
 });
 const taskForm=modal.querySelector('form');
 const estimate=taskForm.elements.hours, points=taskForm.querySelector('#task-points');
 const updatePoints=()=>{const value=taskPoints({hours:estimate.value});points.textContent=value?value+' points':'Enter estimated hours to calculate points';};
 estimate.addEventListener('input',updatePoints);updatePoints();
 if(!key)$('#task-template').onchange=event=>chooseTemplate(event.target.value);
 }
 if(act==='event'){openEvent(key);return}
 if(act==='project'){openProject(key);return}
 if(act==='person'){
 const p=key===''?{}:data.people[Number(key)], old=p.name;
 form('Employee profile',input('Name','name',p.name,'text',true)+input('Department','team',p.team,'text',true)+input('Role','role',p.role,'text',true)+select('Reporting manager','manager',nameOptions(p.manager,'None')),'Save employee',v=>{
 v.name=v.name.trim();if(!v.name||data.people.some(x=>x!==p&&x.name===v.name))throw Error('Enter a unique employee name.');
 if(v.manager===v.name||v.manager&&v.manager===old)throw Error('Choose a different reporting manager.');
 if(old&&old!==v.name){if(old==='Vansh')throw Error('The workspace owner name is fixed.');for(const record of [...data.leads,...data.tasks,...data.projects,...data.events,...data.messages,...data.reviews])if(assignedTo(record,old)){if(Array.isArray(record.owners))setAssignees(record,assignees(record).map(name=>name===old?v.name:name));else record.owner=v.name;}data.people.forEach(x=>{if(x.manager===old)x.manager=v.name})}
 Object.assign(p,v);if(key==='')data.people.push(p);notify('Employee saved');
 });
 }
 if(act==='import')form('Import expert leads',`<p>Upload a CSV exported from Google Sheets, or paste CSV with Name and Phone or Name (Expert) and Contact Number (General) headers.</p><label>CSV file<input name="file" type="file" accept=".csv,text/csv"></label>`+area('Or paste CSV','csv'),'Import leads',async v=>{const text=v.file.size?await v.file.text():v.csv;if(!text.trim())throw Error('Choose a CSV or paste its contents.');const {added,skipped}=importCsv(text);notify(added+' imported · '+skipped+' skipped');page='Expert Leads';filter='All leads';query=''});
 if(act==='export'){
 const sheet=[['Lead ID','Name','Phone','Specialization','Assigned to','Task','Status','Due date','Instructions','Remarks'],...data.leads.map(l=>[l.id,l.name,l.phone,l.area,assigneeLabel(l),l.action,l.status,l.due,l.instructions,l.note])];
 const csv=sheet.map(row=>row.map(v=>{let s=String(v??'');if(/^[\s]*[=+@-]/.test(s)&&!/^\+\d+$/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'}).join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='svaveda-expert-leads.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
});
$('#quick').onclick=()=>{modal.innerHTML='<h2>Create</h2><div class="create-choices">'+btn('Quick capture','quick-lead')+btn('Expert lead','lead')+btn('Task','task')+btn('Calendar event','event')+(isSuperAdmin()?btn('Employee','person'):'')+'</div>';modal.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>modal.close()));modal.showModal()};
function readRecord(heading,body){
 modal.innerHTML='<h2>'+heading+'</h2>'+body+'<button id="close-record">Close</button>';
 $('#close-record').onclick=()=>modal.close();
 modal.showModal();
}
function renderRoles(){
 const rows=[{name:currentName,email:'Current Site owner',role:'Super Admin'},...roleSeats];
 const roleIndex={Founder:0,Employee:0};
 ui.innerHTML=title('Roles & Access','Configure who can use the SvaVeda workspace.')+
 panel('Workspace seats',`<form id="seat-form" class="seat-form"><div class="seat-list">${rows.map((seat,i)=>{
 const number=i?++roleIndex[seat.role]:1;
 return `<div class="seat-row"><strong>${seat.role} ${number}</strong>${i?input('Display name','name'+i,seat.name)+input('Sign-in email','email'+i,seat.email,'email'):'<span>'+e(seat.name)+'</span><span>Current Site owner</span>'}</div>`;
 }).join('')}</div><div class="item"><p>Use the email each person uses to sign in to ChatGPT. Site access must also be granted to that email.</p><button class="primary">Save roles</button><p role="alert" id="seat-error"></p></div></form>`)+
 panel('Permissions',table(['Role','Workspace access'],[
 '<tr><td>Super Admin</td><td>All ERP records, employee directory and role management</td></tr>',
 '<tr><td>Founder</td><td>Manage leads, tasks, projects and calendar</td></tr>',
 '<tr><td>Employee</td><td>Assigned work, task updates and personal attendance</td></tr>'
 ]));
 $('#seat-form').onsubmit=async event=>{
  event.preventDefault();if(busy)return;busy=true;
  const value=new FormData(event.currentTarget),button=event.currentTarget.querySelector('button');button.disabled=true;
  const seats=roleSeats.map((seat,i)=>({...seat,name:value.get('name'+(i+1)).trim(),email:value.get('email'+(i+1)).trim().toLowerCase()}));
  try {
   data.seats=seats;
   await save();
   roleSeats=seats;
   render();notify('Roles saved');
  } catch(error){data=structuredClone(committed);$('#seat-error').textContent=error.message}
  finally{busy=false;button.disabled=false}
 };
}
const jump=$('#jump-dialog');
function openJump(){
 if(!data||busy||modal.open||jump.open)return;
 jump.innerHTML=`<h2 id="jump-title">Search workspace</h2><input id="jump-query" type="search" placeholder="Find a page, task, lead, or project" aria-label="Search workspace" autocomplete="off"><div id="jump-results"></div>`;
 const search=$('#jump-query'), results=$('#jump-results');
 const pages=nav.flatMap(group=>group.pages).filter(name=>{
  if(['Integrations','Roles & Access'].includes(name))return isSuperAdmin();
  return !isEmployee()||!['Overview','Employees','Review Queue'].includes(name);
 });
 const destinations=[
 ...pages.map(name=>({name,type:'Page',act:'nav',key:name})),
 ...data.tasks.map(item=>({name:item.title,type:'Task',act:'task',key:item.id})),
 ...data.leads.map(item=>({name:item.name,type:'Expert lead',act:'lead',key:item.id})),
 ...data.projects.map(item=>({name:item.name,type:'Project',act:'ops-project',key:item.id}))
 ];
 function update(){
  const query=search.value.trim().toLowerCase();
  const matches=destinations.filter(item=>!query?item.type==='Page':(item.name+' '+item.type).toLowerCase().includes(query)).slice(0,9);
  results.innerHTML=matches.map(item=>`<button class="jump-result" data-act="${item.act}" data-key="${e(item.key)}"><strong>${e(item.name)}</strong><small>${item.type}</small></button>`).join('')||empty('No matching pages or records.');
 }
 search.oninput=update;
 jump.onkeydown=event=>{
  if(event.key==='Enter'&&event.target===search){event.preventDefault();results.querySelector('button')?.click();return}
  if(!['ArrowDown','ArrowUp'].includes(event.key))return;
  const buttons=[...results.querySelectorAll('button')];
  if(!buttons.length)return;
  event.preventDefault();
  const current=buttons.indexOf(document.activeElement);
  const next=event.key==='ArrowDown'?(current+1)%buttons.length:current<=0?buttons.length-1:current-1;
  buttons[next].focus();
 };
 results.onclick=event=>{if(event.target.closest('button'))jump.close()};
 update();jump.showModal();search.focus();
}
$('#jump').onclick=openJump;
document.addEventListener('keydown',event=>{
 if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'&&!$('#jump').disabled&&!modal.open){
  event.preventDefault();
  if(jump.open)jump.close();else openJump();
 }
});
function closeNavigation(){
 $('.workspace-sidebar').classList.remove('menu-open');
 $('#nav-toggle').setAttribute('aria-expanded','false');
}
$('#nav-toggle').onclick=()=>{
 const shown=$('.workspace-sidebar').classList.toggle('menu-open');
 $('#nav-toggle').setAttribute('aria-expanded',String(shown));
};

function teamDirectory(){
 if(isEmployee())return '';
 return panel('Directory',`<div class="toolbar">${isSuperAdmin()?btn('Add employee','person','',true):'<span>Employee directory</span>'}</div>`+data.people.map((person,i)=>`<div class="item row"><div>${ownerLink(person.name)}<small>${e([person.team,person.role,person.manager?'Reports to '+person.manager:''].filter(Boolean).join(' · '))}</small></div>${isSuperAdmin()?btn('Edit','person',i):''}</div>`).join(''));
}
function teamPerformance(){
 return panel('Team activity',table(['Employee','Tasks completed','Leads assigned','Experts onboarded'],data.people.map(p=>`<tr><td>${ownerLink(p.name)}</td><td>${data.tasks.filter(t=>assignedTo(t,p.name)&&t.status==='Done').length}</td><td>${data.leads.filter(l=>assignedTo(l,p.name)).length}</td><td>${data.leads.filter(l=>assignedTo(l,p.name)&&l.status==='Onboarded').length}</td></tr>`)));
}

const headerKey=value=>String(value??'').trim().toLowerCase().replace(/[^a-z]/g,'');
function sheetDate(value){
 let normalizedDate=value;
 const match=value.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
 if(match)normalizedDate=match[3]+'-'+match[2].padStart(2,'0')+'-'+match[1].padStart(2,'0');
 return /^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)&&!Number.isNaN(Date.parse(normalizedDate))&&new Date(normalizedDate).toISOString().slice(0,10)===normalizedDate?normalizedDate:'';
}
function leadColumn(lead,label){
 return (lead.sheetFields||[]).find(([key])=>headerKey(key)===headerKey(label))?.[1]||'';
}
function leadSheetDetails(lead){
 const fields=lead.sheetFields||[];
 return fields.length?`<details class="lead-details"><summary>Imported Sheet details · ${fields.length}</summary><dl>${fields.map(([label,value])=>`<dt>${e(label)}</dt><dd>${e(value)}</dd>`).join('')}</dl></details>`:'';
}
function ownerLink(name){
 return name&&(!isEmployee()||name===currentName)?`<button type="button" class="link" data-act="owner-work" data-key="${e(name)}" title="View tasks for ${e(name)}">${e(name)}</button>`:e(name||'Unassigned');
}
function openOwnerWork(name){
 const tasks=data.tasks.filter(task=>assignedTo(task,name));
 const open=tasks.filter(task=>task.status!=='Done'), done=tasks.filter(task=>task.status==='Done');
 const hours=open.reduce((total,task)=>total+(Number(task.hours)||0),0);
 const overdue=open.filter(task=>task.due&&task.due<day()).length;
 const leave=(data.requests||[]).filter(request=>request.owner===name&&request.kind==='Leave'&&request.status==='Approved'&&request.end>=day());
 const workload=panel('Workload',listItem('Open work',open.length+' tasks · '+overdue+' overdue · '+hours+' estimated hours')+leave.map(request=>listItem('Approved leave',request.start+' – '+request.end)).join(''));
 readRecord(e(name)+' · Tasks',workload+panel('Open · '+open.length,taskRows(open))+panel('Completed · '+done.length,taskRows(done)));
}
function taskChecklist(task){
 const items=task.checklist||[];
 return items.length?`<fieldset><legend>Checklist</legend>${items.map((item,i)=>`<label class="checklist-step"><input type="checkbox" name="step${i}" ${item.done?'checked':''}> ${e(item.text)}</label>`).join('')}</fieldset>`:'';
}
let alertScan=false, messageAlerts=[];
const recentNotificationDays=30;
function activityAlerts(state){
 const today=day(), entries=[];
 const cutoff=Date.now()-recentNotificationDays*86400000;
 const managers=!isEmployee();
 const add=(id,label,subject,at,act,key)=>entries.push({id,label,subject,at:Number(at)||0,act,key});
 for(const task of state.tasks){
  const mine=assignedTo(task,currentName), status=task.status;
  if(status==='Done'){
   if((mine||managers)&&assignees(task).length&&task.completedAt>=cutoff)
    add('done:'+task.id+':'+task.completedAt,'Assigned task completed',[task.title,task.completedBy&&'Completed by '+task.completedBy,assigneeLabel(task)].filter(Boolean).join(' · '),task.completedAt,'task',task.id);
   continue;
  }
  if(mine&&task.assignedAt>=cutoff)add('assigned:'+task.id+':'+task.assignedAt,task.handoffReady?'Expert details ready':'Task assigned',task.title,task.assignedAt,'task',task.id);
  if(mine&&status==='Rework')add('rework:'+task.id+':'+(task.statusChangedAt||0),'Task returned for changes',task.title,task.statusChangedAt,'task',task.id);
  if(managers&&status==='In review')add('review:'+task.id+':'+(task.reviewAt||0),'Task awaiting review',task.title,task.reviewAt,'ops-decision','Task|'+task.id);
  if(mine&&status!=='In review'&&task.due&&task.due<=today)
   add('task-due:'+task.id+':'+task.due,task.due===today?'Task due today':'Task overdue',task.title,0,'task',task.id);
 }
 for(const lead of state.leads.filter(lead=>assignedTo(lead,currentName)&&lead.due&&lead.due<=today&&!['Do not contact','Not interested','Invalid number','Onboarded','Program listed'].includes(lead.status)))
  add('lead:'+lead.id+':'+lead.due,'Follow-up #'+(loggedFollowUps(lead).length+1)+' due',[lead.name,lead.action,'Due '+lead.due].filter(Boolean).join(' · '),0,'outcome',lead.id);
 for(const event of state.events.filter(item=>item.date===today&&item.category!=='Holiday'&&(!item.owner||item.owner===currentName)))
  add('event:'+event.id+':'+event.date,'Scheduled today',event.title,0,'event',event.id);
 for(const request of state.requests||[]){
  if(assignedTo(request,currentName)&&request.status!=='Pending')
   add('request:'+request.id+':'+request.status,'Request '+request.status.toLowerCase(),request.kind,request.decisionAt||request.at,'nav','Attendance');
  if(managers&&request.status==='Pending')
   add('review-request:'+request.id,'Request awaiting review',[request.kind,request.owner].filter(Boolean).join(' · '),request.at,'ops-decision','Request|'+request.id);
 }
 return [...entries,...messageAlerts].sort((a,b)=>b.at-a.at);
}
const notificationReadKey=()=> 'svaveda-notifications-v1-'+currentName;
function readNotifications(){
 try{return new Set(JSON.parse(localStorage.getItem(notificationReadKey())||'[]'));}catch{return new Set();}
}
function markNotifications(ids){
 try{localStorage.setItem(notificationReadKey(),JSON.stringify([...new Set([...readNotifications(),...ids])].slice(-2000)));}catch{}
}
function notificationPanel(full=false){
 const read=readNotifications();
 const items=activityAlerts(data).sort((a,b)=>Number(read.has(a.id))-Number(read.has(b.id)));
 const unread=items.filter(item=>!read.has(item.id)).length;
 const rows=items.slice(0,full?100:6).map(item=>{
  const description=[item.subject,item.at?calendarStamp(item.at):''].filter(Boolean).join(' · ');
  return `<div class="item row notification-row" ${read.has(item.id)?'':'data-unread="true"'}><div><strong>${e(item.label)}</strong><p>${e(description)}</p></div><button type="button" data-act="${item.act}" data-key="${e(item.key)}" data-notification-id="${e(item.id)}">Open</button></div>`;
 }).join('')||empty('You’re caught up.');
 return panel('Notifications'+(unread?' · '+unread+' unread':''),rows+`<div class="panel-foot actions">${unread?btn('Mark all read','notifications-read'):''}${full?'':btn('View all','desktop-inbox')}</div>`);
}
async function updateWorkspace(){
 const response=await fetch('/api/workspace');
 const result=await response.json();
 if(!response.ok)throw Error(result.error||'Could not check workspace updates.');
 if(result.name!==currentName||result.role!==role)return false;
 if(result.revision>revision){
  data=result.data;revision=result.revision;roleSeats=result.seats;
  committed=structuredClone(data);
 }
 return true;
}
async function refreshAlerts(baseline=false){
 if(alertScan||busy||!data)return;
 alertScan=true;
 try{
  const startRevision=revision;
  const response=await fetch('/api/workspace');
  if(!response.ok)return;
  const result=await response.json();
  if(!result.data||result.role!==role||result.name!==currentName)return;
  const beforeMessages=messageAlerts.map(item=>item.id).join('|');
  try{
   const messages=await messageRequest();
   messageAlerts=(messages.messages||[]).filter(message=>message.recipient===messages.user&&message.sender!==messages.user).slice(-20)
    .map(message=>({id:'message:'+message.id,label:'New workspace message',subject:'Open Messages to read it',at:Number(message.created)||0,act:'nav',key:'Messages'}));
  }catch{}
  const entries=activityAlerts(result.data);
  const key='svaveda-desktop-v1-'+currentName;
  const previous=JSON.parse(localStorage.getItem(key)||'null');
  const seen=new Set(Array.isArray(previous)?previous:[]);
  const added=entries.filter(item=>!seen.has(item.id));
  if(previous&&!baseline&&added.length&&typeof Notification!=='undefined'&&Notification.permission==='granted'){
   const categories=[...new Set(added.map(item=>item.label))];
   const notification=new Notification('SvaVeda Workspace',{body:categories.length===1?categories[0]:added.length+' new workspace updates',tag:'svaveda-workspace'});
   notification.onclick=()=>{window.focus();if(!modal.open&&!busy){page=categories.length===1&&categories[0]==='New workspace message'?'Messages':'Inbox';render()}notification.close()};
  }
  localStorage.setItem(key,JSON.stringify([...seen,...added.map(item=>item.id)].slice(-2000)));
  if(!busy&&!modal.open&&!jump.open&&revision===startRevision&&result.revision>revision&&page!=='Messages'&&page!=='Integrations'){
   data=result.data;revision=result.revision;roleSeats=result.seats;
   committed=structuredClone(data);render();
  }else if(!busy&&!modal.open&&!jump.open&&['My Day','Overview','Inbox'].includes(page)&&beforeMessages!==messageAlerts.map(item=>item.id).join('|'))render();
 }catch{}finally{alertScan=false}
}
async function enableDesktopNotifications(){
 if(typeof Notification==='undefined'){notify('Desktop notifications are unavailable in this browser.');return}
 if(Notification.permission==='denied'){notify('Allow notifications for this Site in your browser settings.');return}
 if(Notification.permission==='default'){
  const status=await Notification.requestPermission();
  if(status==='granted'){await refreshAlerts(true);notify('Desktop alerts enabled. Keep the ERP open.')}
  return;
 }
}
$('#desktop-alerts').onclick=()=>{page='Inbox';render();void refreshAlerts();};
setInterval(()=>{void refreshAlerts();void processSheetQueue().finally(autoPullSheet)},60000);
load();
