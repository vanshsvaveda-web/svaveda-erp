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
 {name:'Work',icon:'☷',pages:['Tasks','Projects']},
 {name:'Expert CRM',icon:'◎',pages:['Expert Leads','Pipeline']},
 {name:'People',icon:'♙',pages:['Employees','Attendance','Performance']},
 {name:'Messages',icon:'✉',pages:['Messages']},
 {name:'Settings',icon:'⚙',pages:['Integrations','Roles & Access']}
];
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
  void autoPullSheet();
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
   const command=await handler(Object.fromEntries(new FormData(event.currentTarget)));
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
const taskRows=tasks=>tasks.length?tasks.map(t=>`<div class="item task-line"><div><button class="link task-name" data-act="task" data-key="${e(t.id)}">${e(t.title)}</button><small>${[t.owner||'Unassigned',t.due?'Due '+t.due:'No due date',t.priority].filter(Boolean).map(e).join(' · ')}</small></div>${pill(t.status)}</div>`).join(''):empty('No tasks in this view.');
let dayTaskQueue, agendaDate, fullCalendarOpen=false;
function renderPersonal(){
 const today=day(), mine=data.tasks.filter(task=>task.owner===currentName);
 const active=mine.filter(task=>!['Done','In review'].includes(task.status));
 const overdue=active.filter(task=>task.due&&task.due<today);
 const current=active.filter(task=>!overdue.includes(task)&&(task.status==='Rework'||!task.due||task.due===today));
 const upcoming=active.filter(task=>task.due>today&&task.status!=='Rework').sort((a,b)=>a.due.localeCompare(b.due));
 const queues={Today:current,Overdue:overdue,Upcoming:upcoming,Review:mine.filter(task=>task.status==='In review')};
 dayTaskQueue||=current.length?'Today':overdue.length?'Overdue':'Today';
 const visible=queues[dayTaskQueue];
 const followUps=data.leads.filter(lead=>lead.owner===currentName&&lead.due&&lead.due<=today&&!['Do not contact','Not interested','Invalid number','Onboarded','Program listed'].includes(lead.status));
 const date=calLabel(today,{dateStyle:'full'});
 const tabs=Object.entries(queues).map(([label,items])=>`<button data-act="day-work-filter" data-key="${label}" aria-pressed="${dayTaskQueue===label}">${label} <span class="tab-count">${items.length}</span></button>`).join('');
 ui.innerHTML=`<div class="personal-heading"><div><div class="day-date">${e(date)} · IST</div><h1>${greeting()}, ${e(currentName)}.</h1></div><div class="actions">${btn('Full calendar','personal-calendar')}${isEmployee()?btn('Request leave','ops-request','Leave',true):btn('＋ New task','task','',true)}</div></div>
 <div class="split home-columns day-workspace"><div>
 ${panel('My work',`<div class="toolbar filter-tabs" aria-label="My work filters">${tabs}</div>`+(visible.length?visible.map(dayTaskRow).join(''):empty('No tasks in this queue.'))+`<div class="panel-foot">${btn('All my tasks','personal-tasks','Mine')}</div>`)}
 ${followUps.length?panel('Expert follow-ups due',followUps.slice(0,6).map(lead=>listItem(lead.name,'Due '+lead.due,btn('Log outcome','outcome',lead.id))).join('')):''}
 </div>
 <div>${panel('My schedule',dayAgenda())}
 ${isFounder()?'':panel('My attendance',attendanceCard())}</div></div>
 <details class="day-secondary"><summary>Updates, requests${isEmployee()?'':' and reviews'}</summary>
 <div class="split"><div>${panel('Updates',myDayUpdates())}${personalRequests()}</div><div>
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
 const entries=calendarEntries().filter(item=>item.date===agendaDate&&(item.owner===currentName||item.action==='event'&&!item.owner)).sort((a,b)=>(a.time||'99').localeCompare(b.time||'99'));
 return `<div class="day-agenda"><div class="agenda-week">${btn('‹','agenda-week','-7')}<strong>${e(calLabel(agendaDate,{month:'long',year:'numeric'}))}</strong>${btn('›','agenda-week','7')}${btn('Today','agenda-date',today)}</div><div class="date-strip">${days.map(date=>`<button data-act="agenda-date" data-key="${date}" aria-label="${e(calLabel(date,{dateStyle:'full'}))}" aria-pressed="${date===agendaDate}"><small>${e(calLabel(date,{weekday:'short'}))}</small><strong>${Number(date.slice(-2))}</strong></button>`).join('')}</div>
 <div class="agenda-items">${entries.map(item=>`<div class="agenda-row"><span class="agenda-time">${item.time?e(eventTime(item.time)):item.category==='Task'||item.category==='Follow-up'?'Due':'All day'}</span><div><button class="link" data-act="${item.action}" data-key="${e(item.id)}">${e(item.title)}</button><small>${e(item.category)}</small></div></div>`).join('')||empty('Nothing scheduled for this day.')}</div>
 ${isEmployee()?'':`<div class="panel-foot">${btn('＋ Add event','cal-add',agendaDate)}</div>`}</div>`;
}
function renderHome(open,unassigned,due){
 const today=day();
 const tasks=open.slice().sort((a,b)=>(a.status!=='Rework')-(b.status!=='Rework')||(a.due||'9999').localeCompare(b.due||'9999'));
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
 <div class="split home-columns"><div>${panel('Team tasks',taskRows(tasks.slice(0,6))+`<div class="panel-foot">${btn('View tasks','nav','Tasks')}</div>`)}${panel('Expert follow-ups',followUps.slice(0,6).map(l=>listItem(l.name,l.owner||'Unassigned',btn('Log outcome','outcome',l.id))).join('')||empty('No follow-ups due.'))}</div>
 <div>${isFounder()?'':panel('Attendance',attendanceCard())}${panel('Today’s meetings',meetings.map(item=>listItem(item.title,[eventTime(item.time),item.owner].filter(Boolean).join(' · '),btn('Open','event',item.id))).join('')||empty('No meetings today.'))}</div></div>`;

}

function render(){
 const module=nav.find(item=>item.pages.includes(page));
 $('aside footer').innerHTML=`<span class="profile-avatar">${e(currentName.split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase())}</span><span class="profile-label"><strong>${e(currentName)}</strong><small>${e(role)}</small></span>`;
 const entries=[[isFounder()?'Overview':'My Day','◷','Home'],['Expert Leads','◎','Expert CRM'],['Tasks','☷','Work'],['Messages','✉','Messages'],['Attendance','♙','People'],['Integrations','⚙','Settings']];
 const labels={'Expert Leads':'Experts',Tasks:'Work',Attendance:isEmployee()?'Attendance':'Team',Integrations:'Settings'};
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
 'My leads':data.leads.filter(lead=>lead.owner===currentName),'Follow-ups':due
 };
 const visible=queues[filter].filter(lead=>[lead.name,lead.phone,lead.area,lead.owner,leadColumn(lead,'Brand / Organisation'),leadColumn(lead,'City')].join(' ').toLowerCase().includes(query.toLowerCase()));
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
  <td>${pill(lead.status)}</td><td>${ownerLink(lead.owner)}</td>
  <td>${lead.action?`<strong>${e(lead.action)}</strong>`:'<span class="muted">—</span>'}${due?`<small>${e(due)}</small>`:''}</td>
  <td><div class="lead-row-actions">${checkbox?btn(lead.owner?'Reassign':'Assign','assign',lead.id):''}${btn('Log','outcome',lead.id)}${leadContact(lead)}</div></td></tr>`;
 });
 const caption=visible.length?`Showing ${start+1}–${start+shown.length} of ${visible.length}`:'0 leads';
 const pager=`<div class="lead-pagination"><span>${caption}</span><div><button data-act="lead-page" data-key="-1" ${leadPage===1?'disabled':''}>Previous</button><span>${leadPage} / ${totalPages}</span><button data-act="lead-page" data-key="1" ${leadPage===totalPages?'disabled':''}>Next</button></div></div>`;
 ui.innerHTML=title('Experts','Manage assignments, outreach and onboarding.',btn('Pipeline','expert-view','Pipeline')+(isEmployee()?'':(isSuperAdmin()?btn('Import from Sheet','nav','Integrations'):btn('Import CSV','import'))+btn('＋ Add lead','lead','',true)))+
 `<section class="panel leads-panel"><div class="toolbar"><input id="search" aria-label="Search leads" placeholder="Search experts, cities, or owners" value="${e(query)}"><span class="results-count">${visible.length} ${visible.length===1?'lead':'leads'}</span>${checkbox?btn('Export CSV','export'):''}</div><div class="filter-tabs lead-tabs" aria-label="Lead filters">${tabs}</div>${checkbox&&selected.size?`<div class="bulk-toolbar"><strong>${selected.size} selected</strong>${btn('Clear','lead-clear')}${btn('Assign selected','assign','',true)}</div>`:''}
 ${shown.length?`<div class="lead-table-scroll ${checkbox?'with-selection':''}">${table(heads,rows)}</div>${pager}`:empty('No leads match this view.')}</section>`;
 $('#search').oninput=event=>{query=event.target.value;leadPage=1;selected.clear();const pos=event.target.selectionStart;render();$('#search').focus();$('#search').setSelectionRange(pos,pos)};
 if($('#all'))$('#all').onchange=event=>{shown.forEach(lead=>event.target.checked?selected.add(lead.id):selected.delete(lead.id));render()};

 }
 if(page==='Tasks'){
 const scope=personalTaskScope?data.tasks.filter(task=>task.owner===currentName):data.tasks;
 const waiting=task=>task.status!=='Done'&&task.status!=='In review';
 const tasks=scope.filter(t=>taskFilter==='All'||taskFilter==='Open'&&t.status!=='Done'||
 taskFilter==='Mine'&&t.status!=='Done'&&t.owner===currentName||
 taskFilter==='Today'&&waiting(t)&&(t.status==='Rework'||!t.due||t.due<=day())||
 taskFilter==='Review'&&t.status==='In review'||
 taskFilter==='Overdue'&&waiting(t)&&t.due&&t.due<day()||
 taskFilter==='Completed'&&t.status==='Done');
 const filters=personalTaskScope?['Mine','Today','Overdue','Review','Completed']:['Open','Today','Overdue','Review','Completed','All'];
 const list=tasks.length?table(['Task','Assignee','Due date','Priority','Status'],tasks.map(t=>`<tr><td><button class="link" data-act="task" data-key="${e(t.id)}">${e(t.title)}</button></td><td>${ownerLink(t.owner)}</td><td>${e(t.due||'—')}</td><td>${e(t.priority)}</td><td>${pill(t.status)}</td></tr>`)):empty('No tasks in this view.');
 const dated=tasks.filter(task=>task.due).sort((a,b)=>a.due.localeCompare(b.due));
 const days=[...new Set(dated.map(task=>task.due))];
 const schedule=days.length?days.map(date=>`<div class="task-date-group"><h3>${e(calLabel(date,{weekday:'long',day:'numeric',month:'short'}))}</h3>${taskRows(dated.filter(task=>task.due===date))}</div>`).join(''):empty('No dated tasks in this view.');
 ui.innerHTML=title(personalTaskScope?'My tasks':'Work',isEmployee()?'Open a task to update or submit your work.':'Assign work, track time and review submissions.',isEmployee()?'':btn('＋ New task','task','',true))+
 `<div class="panel"><div class="toolbar view-toolbar"><div class="filter-tabs" aria-label="Task filters">${filters.map(name=>`<button data-act="task-tab" data-key="${name}" aria-pressed="${name===taskFilter}">${name==='Mine'?'All open':name}</button>`).join('')}</div><div class="segments" aria-label="Task view">${['List','Board','Due dates'].map(name=>`<button data-act="task-view" data-key="${name}" aria-pressed="${name===taskView}">${name}</button>`).join('')}</div></div>${taskView==='List'?list:taskView==='Board'?taskBoard(tasks):schedule}</div>`+workProjects();

 }
 if(page==='Review Queue'){renderReviewQueue();return}
 if(page==='Projects'){renderProjects();return}

 if(page==='Attendance'&&isFounder())ui.innerHTML=title('Team','Manage team workload and availability.',btn('Approvals','nav','Review Queue'))+teamDirectory();
 else if(page==='Attendance')ui.innerHTML=title(isEmployee()?'Attendance':'Team','Track check-ins, breaks and working hours.',btn('New request','ops-request'))+panel('Today',attendanceCard())+panel('Attendance history',table(['Date','Check-in','Check-out','Working time'],Object.entries(data.attendance).sort().reverse().map(([d,a])=>`<tr><td>${d}</td><td>${clock(a.in)}</td><td>${clock(a.out)}</td><td>${a.out?duration(a.out-a.in-(a.breakMs||0)):'In progress'}</td></tr>`)))+personalRequests()+teamDirectory()+teamPerformance();
 if(page==='Employees'){page='Attendance';render();return}
 if(page==='Performance'){page='Attendance';render();return}
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
 const fields={title:l.action+' · '+l.name,owner:l.owner,due:l.due,priority:l.priority||'Medium',note:l.instructions||'',lead:l.id};
 if(active.length)Object.assign(active[0],fields);else data.tasks.unshift({id:id(),status:'To do',...fields});
}
const normalized=s=>s.replace(/\D/g,'').replace(/^91(?=\d{10}$)/,'');
function setLead(l,v){
 v.name=v.name.trim();v.phone=v.phone.trim();
 if(!v.name||!normalized(v.phone))throw Error('Enter a name and valid phone number.');
 if(data.leads.some(x=>x.id!==l.id&&normalized(x.phone)===normalized(v.phone)))throw Error('This phone number already belongs to a lead.');
 Object.assign(l,v);if(!data.leads.includes(l))data.leads.unshift(l);makeTask(l);
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
 const columns={name:find(...names),phone:find(...phones),owner:find('assignedto','owner','assignee','teammember'),action:find('nextaction','todo','task','action'),due:find('followupdate','duedate','nextfollowup'),status:find('leadstatus','pipelinestatus','communicationstage','status'),area:find('specialization','area','keyword'),priority:find('priority'),instructions:find('instructions','todo'),note:find('remarks','notes')};
 const byPhone=new Map(data.leads.map(lead=>[normalized(lead.phone),lead]));
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
 const people=[...data.people,...(roleSeats||[]).filter(person=>person.email)];
 fields.owner=people.find(person=>person.name.toLowerCase()===fields.owner.toLowerCase())?.name||'';
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
  const previous=existing.sheetSnapshot;
  for(const [key,value] of Object.entries(fields)){
   if(previous&&columns[key]>=0&&existing[key]===previous[key]&&value!==previous[key])existing[key]=value;
  }
  if(previous&&Object.keys(fields).some(key=>previous[key]!==fields[key])){makeTask(existing);updated++}
  existing.sheetSnapshot=fields;
  existing.sheetFields=sheetFields;
 }else{
  const lead={id:id(),source,sheetFields,...fields};
  if(source==='Google Sheets')lead.sheetSnapshot={...fields};
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
 const b=ev.target.closest('[data-act]');if(!b||busy)return;
 const {act,key}=b.dataset;
 if(act==='sheet-write-lead'&&isSuperAdmin()){
  busy=true;
  try{
   const response=await fetch('/api/sheets/write-lead',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:key})});
   const result=await response.json();
   if(!response.ok)throw Error(result.error||'Sheet update failed.');
   await updateWorkspace();
   notify(result.created?'Lead added to Sheet':result.updatedCells?result.updatedCells+' Sheet cells updated':'Sheet already matches the saved changes');
  }catch(error){notify(error.message)}
  finally{busy=false}
  return;
 }
 if(act==='sheet-disconnect'&&isSuperAdmin()){
  form('Disconnect Google Sheet','<p>Stop automatic pulls from this Sheet. Imported leads stay in the workspace.</p>','Disconnect',()=>{delete data.sheetLink;delete data.sheetSyncedAt;sheetError=''});
  return;
 }
 if(act==='desktop-inbox'){if(modal.open)modal.close();page='Inbox';render();return}

 if(act==='inbox-refresh'){await load();return}
 if(act==='template'&&!isEmployee()){chooseTemplate(key);return}
 if(act==='personal-tasks'){personalTaskScope=true;taskFilter=key;page='Tasks';render();return}
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
  const task=data.tasks.find(item=>item.id===key&&item.owner===currentName);
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
 if(act==='nav'||act==='queue'){closeNavigation();if(key==='Tasks'){personalTaskScope=false;taskFilter='Open'}if(key==='Expert Leads'){expertView='List';leadPage=1}page=act==='queue'?'Expert Leads':key;filter=act==='queue'?'Unassigned':b.dataset.filter||(isEmployee()?'My leads':'All leads');query='';selected.clear();render();ui.focus({preventScroll:true});return}
 if(act==='attendance'&&!isFounder()){
 const a=data.attendance[day()]||={};
 const now=Date.now();
 if(key==='in')a.in=now;
 if(key==='break'&&!a.pause)a.pause=now;
 else if(a.pause){a.breakMs=(a.breakMs||0)+now-a.pause;delete a.pause}
 if(key==='out')a.out=now;
 busy=true;try{await save()}catch(error){data=structuredClone(committed);notify(error.message)}finally{busy=false;render()}return;
 }
 if(act==='lead'){
 const l=data.leads.find(x=>x.id===key)||{id:id(),status:'New',source:'Manual'};
 const phone=normalized(l.phone||'');
 const links=phone&&!['Do not contact','Invalid number'].includes(l.status)?`<p><a href="tel:${e(l.phone.replace(/[^+\d]/g,''))}">Call</a> · <a target="_blank" rel="noopener noreferrer" href="https://wa.me/${phone.length===10?'91'+phone:phone}">Open WhatsApp</a></p>`:'';
 const history=(l.history||[]).map(h=>`<p>${e([h.date,h.actor,h.method,h.status,h.note].filter(Boolean).join(' · '))}</p>`).join('');
 if(isEmployee()){readRecord(e(l.name),links+'<p>'+e([l.status,l.action,l.due].filter(Boolean).join(' · '))+'</p><p>'+e(l.instructions)+'</p>'+leadSheetDetails(l)+history);return}
 form(key?'Edit expert lead':'Add expert lead',links+(key&&data.sheetLink&&isSuperAdmin()?btn('Update Sheet','sheet-write-lead',l.id):'')+input('Name','name',l.name,'text',true)+input('Phone','phone',l.phone,'tel',true)+input('Specialization','area',l.area)+select('Stage','status',options(statuses,l.status))+select('Assigned to','owner',nameOptions(l.owner))+input('Next action','action',l.action)+input('Due date','due',l.due,'date')+area('Instructions','instructions',l.instructions)+leadSheetDetails(l)+history,'Save lead',v=>{if(v.owner&&!v.action)v.action='Initial call';if(v.owner&&!v.due)v.due=day();setLead(l,v);notify('Lead saved')});
 }
 if(act==='assign'){
 const leads=data.leads.filter(l=>key?l.id===key:selected.has(l.id));
 if(!leads.length)return;
 form('Assign '+(key?e(leads[0].name):leads.length+' leads'),select('Assign to','owner',nameOptions(leads[0].owner))+select('Task','action',options([...actions,'Custom'],leads[0].action))+input('Custom task title','custom')+input('Due date','due',key&&leads[0].due||day(),'date',true)+select('Priority','priority',options(['Low','Medium','High','Urgent'],'Medium'))+area('Instructions','instructions',leads[0].instructions),'Assign and create tasks',v=>{
 if(!v.owner)throw Error('Choose an employee.');
 if(v.action==='Custom'&&!v.custom.trim())throw Error('Enter a custom task title.');
 const eligible=leads.filter(l=>!['Do not contact','Not interested','Invalid number','Onboarded'].includes(l.status));
 if(!eligible.length)throw Error('These leads are closed to outreach.');
 eligible.forEach(l=>{Object.assign(l,{owner:v.owner,action:v.action==='Custom'?v.custom.trim():v.action,due:v.due,priority:v.priority,instructions:v.instructions});makeTask(l)});
 selected.clear();notify(eligible.length+' assigned'+(eligible.length<leads.length?' · Closed leads skipped':''))
 });
 }
 if(act==='outcome'){openLeadOutcome(key);return}
 if(act==='task'){
 if(modal.open)modal.close();
 const t=data.tasks.find(x=>x.id===key)||{id:id(),status:'To do',priority:'Medium',start:day(),due:day(),projectId:page==='Projects'?projectSelection:''};
 if(isEmployee()){
  if(t.status==='Done'){readRecord(e(t.title),'<p>Completed</p><p>'+e(t.note)+'</p>'+download(t.file));return}
  form(e(t.title),'<p>'+e([t.due,t.priority,t.note].filter(Boolean).join(' · '))+'</p>'+download(t.file)+select('Status','status',options(['To do','In progress','Blocked','In review'],t.status==='Rework'?'In progress':t.status))+select('Timer','timerAction',options(['Keep current',t.timer?'Pause':'Start'],'Keep current'))+'<p>Tracked '+duration((t.elapsed||0)+(t.timer?Math.max(0,Date.now()-t.timer):0))+'</p>'+taskChecklist(t)+area('Work submission or comment','comment')+input('Submission attachment','submission','','file')+(t.submission?download(t.submission):'')+(t.comments||[]).map(c=>'<p>'+e(c)+'</p>').join(''),'Update task',async value=>{
   t.checklist=(t.checklist||[]).map((item,i)=>({...item,done:value['step'+i]==='on'}));
   const file=await attach(value.submission);if(file)t.submission=file;
   if(value.timerAction==='Start'&&value.status!=='In review')t.timer=Date.now();
   if((value.timerAction==='Pause'||value.status==='In review')&&t.timer){t.elapsed=(t.elapsed||0)+Math.max(0,Date.now()-t.timer);delete t.timer}
   t.status=value.status;
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
 const details=select('Repeat after completion','repeat',options(['None','Daily','Weekly','Monthly'],t.repeat||'None'))+area('Checklist (one step per line)','checklistText',(t.checklist||[]).map(item=>item.text).join('\n'))+select('Priority','priority',options(['Low','Medium','High','Urgent'],t.priority))+select('Status','status',options(taskStatuses,t.status))+input('Estimated hours','hours',t.hours,'number')+area('Comment','comment')+(t.comments||[]).map(c=>'<p>'+e(c)+'</p>').join('')+input('Attachment','attachment','','file')+download(t.file);
 const fields=(!key?templateField():'')+input('Title','title',t.title,'text',true)+select('Assigned to','owner',nameOptions(t.owner))+projectField(t.projectId)+input('Start date','start',t.start,'date')+input('Due date','due',t.due,'date')+area('Instructions','note',t.note);
 const tracker=key?`<p>Tracked ${duration(tracked)} · ${t.timer?'Running':'Paused'}</p>${select('Timer','timerAction',options(['Keep current',t.timer?'Pause':'Start'],'Keep current'))}`:'';
 form(key?'Task details':'New task',fields+`<details class="task-options" ${key?'open':''}><summary>Priority, status and attachments</summary><div class="task-options-grid">${details}${tracker}</div></details>`,'Save task',async v=>{
 if(v.repeat!=='None'&&!v.due)throw Error('Set a due date for the recurring task.');
 if(v.start&&v.due&&v.start>v.due)throw Error('The due date must be after the start date.');
 const f=await attach(v.attachment);if(f)t.file=f;
 if(v.timerAction==='Start')t.timer=Date.now();if(v.timerAction==='Pause'||v.status==='Done'){if(t.timer)t.elapsed=(t.elapsed||0)+Date.now()-t.timer;delete t.timer}
 if(v.comment.trim())(t.comments||=[]).push(v.comment.trim());
 t.checklist=v.checklistText.split('\n').map(text=>text.trim()).filter(Boolean).slice(0,30).map(text=>({text:text.slice(0,250),done:(t.checklist||[]).find(item=>item.text===text)?.done||false}));
 delete v.checklistText;delete v.attachment;delete v.timerAction;delete v.comment;Object.assign(t,v);if(!key)data.tasks.unshift(t);notify('Task saved');
 });
 if(!key)$('#task-template').onchange=event=>chooseTemplate(event.target.value);
 }
 if(act==='event'){openEvent(key);return}
 if(act==='project'){openProject(key);return}
 if(act==='person'){
 const p=key===''?{}:data.people[Number(key)], old=p.name;
 form('Employee profile',input('Name','name',p.name,'text',true)+input('Department','team',p.team,'text',true)+input('Role','role',p.role,'text',true)+select('Reporting manager','manager',nameOptions(p.manager,'None')),'Save employee',v=>{
 v.name=v.name.trim();if(!v.name||data.people.some(x=>x!==p&&x.name===v.name))throw Error('Enter a unique employee name.');
 if(v.manager===v.name||v.manager&&v.manager===old)throw Error('Choose a different reporting manager.');
 if(old&&old!==v.name){if(old==='Vansh')throw Error('The workspace owner name is fixed.');for(const record of [...data.leads,...data.tasks,...data.projects,...data.events,...data.messages,...data.reviews])if(record.owner===old)record.owner=v.name;data.people.forEach(x=>{if(x.manager===old)x.manager=v.name})}
 Object.assign(p,v);if(key==='')data.people.push(p);notify('Employee saved');
 });
 }
 if(act==='import')form('Import expert leads',`<p>Upload a CSV exported from Google Sheets, or paste CSV with Name and Phone or Name (Expert) and Contact Number (General) headers.</p><label>CSV file<input name="file" type="file" accept=".csv,text/csv"></label>`+area('Or paste CSV','csv'),'Import leads',async v=>{const text=v.file.size?await v.file.text():v.csv;if(!text.trim())throw Error('Choose a CSV or paste its contents.');const {added,skipped}=importCsv(text);notify(added+' imported · '+skipped+' skipped');page='Expert Leads';filter='All leads';query=''});
 if(act==='export'){
 const sheet=[['Lead ID','Name','Phone','Specialization','Assigned to','Task','Status','Due date','Instructions','Remarks'],...data.leads.map(l=>[l.id,l.name,l.phone,l.area,l.owner,l.action,l.status,l.due,l.instructions,l.note])];
 const csv=sheet.map(row=>row.map(v=>{let s=String(v??'');if(/^[\s]*[=+@-]/.test(s)&&!/^\+\d+$/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'}).join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='svaveda-expert-leads.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
});
$('#quick').onclick=()=>{modal.innerHTML='<h2>Create</h2><div class="create-choices">'+btn('Expert lead','lead')+btn('Task','task')+btn('Calendar event','event')+(isSuperAdmin()?btn('Employee','person'):'')+'</div>';modal.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>modal.close()));modal.showModal()};
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
 return panel('Team activity',table(['Employee','Tasks completed','Leads assigned','Experts onboarded'],data.people.map(p=>`<tr><td>${ownerLink(p.name)}</td><td>${data.tasks.filter(t=>t.owner===p.name&&t.status==='Done').length}</td><td>${data.leads.filter(l=>l.owner===p.name).length}</td><td>${data.leads.filter(l=>l.owner===p.name&&l.status==='Onboarded').length}</td></tr>`)));
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
 const tasks=data.tasks.filter(task=>task.owner===name);
 const open=tasks.filter(task=>task.status!=='Done'), done=tasks.filter(task=>task.status==='Done');
 const hours=open.reduce((total,task)=>total+(Number(task.hours)||0),0);
 const overdue=open.filter(task=>task.due&&task.due<day()).length;
 const leave=(data.requests||[]).filter(request=>request.owner===name&&request.kind==='Leave'&&request.status==='Approved'&&request.end>=day());
 const workload=panel('Workload',listItem('Open work',open.length+' tasks · '+overdue+' overdue · '+hours+' estimated hours')+leave.map(request=>listItem('Approved leave',request.start+' – '+request.end)).join(''));
 readRecord(e(name)+' · Tasks',workload+panel('Open · '+open.length,taskRows(open))+panel('Completed · '+done.length,taskRows(done)));
}
function leadContact(lead){
 if(['Do not contact','Invalid number'].includes(lead.status))return '';
 const phone=normalized(lead.phone||'');
 if(!phone)return '';
 const tel=(lead.phone||'').replace(/[^+\d]/g,'');
 return `<a class="contact-action" href="tel:${e(tel)}">Call</a><a class="contact-action" target="_blank" rel="noopener noreferrer" href="https://wa.me/${phone.length===10?'91'+phone:phone}">WhatsApp</a>`;
}

function taskChecklist(task){
 const items=task.checklist||[];
 return items.length?`<fieldset><legend>Checklist</legend>${items.map((item,i)=>`<label class="checklist-step"><input type="checkbox" name="step${i}" ${item.done?'checked':''}> ${e(item.text)}</label>`).join('')}</fieldset>`:'';
}
let alertScan=false;
function activityAlerts(state){
 const today=day(), entries=[];
 for(const task of state.tasks.filter(task=>task.owner===currentName&&task.status!=='Done')){
  entries.push(['assigned:'+task.id,'Task assigned']);
  if(task.status==='Rework')entries.push(['rework:'+task.id+':'+JSON.stringify(task.comments||[]),'Task returned for changes']);
  if(task.status!=='In review'&&task.due&&task.due<=today)entries.push(['task-due:'+task.id+':'+task.due,'Task due or overdue']);
 }
 for(const lead of state.leads.filter(lead=>lead.owner===currentName&&lead.due&&lead.due<=today&&!['Do not contact','Not interested','Invalid number','Onboarded','Program listed'].includes(lead.status)))entries.push(['lead:'+lead.id+':'+lead.due,'Expert follow-up due']);
 for(const item of state.events.filter(item=>item.date===today&&item.category!=='Holiday'&&(!item.owner||item.owner===currentName)))entries.push(['event:'+item.id+':'+item.date,'Meeting on your calendar today']);
 for(const request of (state.requests||[])){
  if(request.owner===currentName&&request.status!=='Pending')entries.push(['request:'+request.id+':'+request.status,'Request decision available']);
  if(!isEmployee()&&request.status==='Pending')entries.push(['review-request:'+request.id,'Request awaiting review']);
 }
 if(!isEmployee())for(const task of state.tasks.filter(task=>task.status==='In review'))entries.push(['review:'+task.id+':'+(task.reviewAt||''),'Task awaiting review']);
 return entries;
}
function myDayUpdates(){
 const totals=new Map();
 for(const [,label] of activityAlerts(data)){
  if(label==='Task assigned')continue;
  totals.set(label,(totals.get(label)||0)+1);
 }
 return ([...totals].map(([label,count])=>listItem(label,count+' update'+(count===1?'':'s'))).join('')||empty('You’re caught up.'))+
  '<div class="panel-foot">'+btn('Open inbox','desktop-inbox')+'</div>';
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
 if(alertScan||busy||!data||typeof Notification==='undefined'||Notification.permission!=='granted')return;
 alertScan=true;
 try{
  const startRevision=revision;
  const response=await fetch('/api/workspace');
  if(!response.ok)return;
  const result=await response.json();
  if(!result.data||result.role!==role||result.name!==currentName)return;
  const entries=activityAlerts(result.data);
  try{
   const messages=await messageRequest();
   for(const message of messages.messages||[])if(message.recipient===messages.user&&message.sender!==messages.user)
    entries.push(['message:'+message.id,'New workspace message']);
  }catch{}
  const key='svaveda-desktop-v1-'+currentName;
  const previous=JSON.parse(localStorage.getItem(key)||'null');
  const seen=new Set(Array.isArray(previous)?previous:[]);
  const added=entries.filter(([id])=>!seen.has(id));
  if(previous&&!baseline&&added.length){
   const categories=[...new Set(added.map(([,label])=>label))];
   const notification=new Notification('SvaVeda Workspace',{body:categories.length===1?categories[0]:added.length+' new workspace updates',tag:'svaveda-workspace'});
   notification.onclick=()=>{window.focus();if(!modal.open&&!busy){page=categories.length===1&&categories[0]==='New workspace message'?'Messages':'Inbox';render()}notification.close()};
  }
  localStorage.setItem(key,JSON.stringify([...seen,...added.map(([id])=>id)].slice(-2000)));
  if(!busy&&!modal.open&&!jump.open&&revision===startRevision&&result.revision>revision&&page!=='Messages'&&page!=='Integrations'){
   data=result.data;revision=result.revision;roleSeats=result.seats;
   committed=structuredClone(data);render();
  }
 }catch{}finally{alertScan=false}
}
$('#desktop-alerts').onclick=async()=>{
 if(typeof Notification==='undefined'){notify('Desktop notifications are unavailable in this browser.');return}
 if(Notification.permission==='denied'){notify('Allow notifications for this Site in your browser settings.');return}
 if(Notification.permission==='default'){
  const status=await Notification.requestPermission();
  if(status==='granted'){await refreshAlerts(true);notify('Desktop alerts enabled. Keep the ERP open.')}
  return;
 }
 page='Inbox';render();
};
setInterval(()=>{void refreshAlerts();void autoPullSheet()},60000);
load();
