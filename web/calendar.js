let calendarDate, calendarView, calendarFilter='All', calendarPerson='', calendarProject='';
const calDay=(value,delta=0)=>{
 const date=new Date(value+'T12:00:00Z');
 date.setUTCDate(date.getUTCDate()+delta);
 return date.toISOString().slice(0,10);
};
const calLabel=(value,format)=>new Intl.DateTimeFormat('en-IN',{...format,timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));
const weekStart=value=>calDay(value,-((new Date(value+'T12:00:00Z').getUTCDay()+6)%7));
const eventTime=value=>value?new Intl.DateTimeFormat('en-IN',{timeZone:'UTC',hour:'numeric',minute:'2-digit',hour12:true}).format(new Date('2000-01-01T'+value+':00Z')):'';
function calendarEntries(){
 return [
 ...(data.requests||[]).filter(item=>item.kind==='Leave'&&item.status==='Approved').flatMap(item=>{
  const dates=[];
  for(let date=item.start;date<=item.end&&dates.length<366;date=calDay(date,1))dates.push(date);
  return dates.map(date=>({id:item.id,date,owner:item.owner,title:item.owner+' · Leave',category:'Leave',action:'ops-leave'}));
 }),
 ...data.events.map(item=>({...item,category:item.category||'Meeting',action:'event'})),
 ...data.tasks.filter(item=>item.due&&item.status!=='Done').map(item=>({...item,date:item.due,category:item.lead?'Follow-up':'Task',action:'task'})),
 ...data.projects.filter(item=>item.due).map(item=>({...item,title:item.name,date:item.due,projectId:item.id,category:'Milestone',action:'ops-project'})),
 ...data.projects.flatMap(project=>(project.milestones||[]).filter(item=>item.due&&!item.done).map(item=>({id:project.id,projectId:project.id,owner:project.owner,title:item.title,date:item.due,category:'Milestone',action:'ops-project'})))
 ].sort((a,b)=>a.date.localeCompare(b.date)||(a.time||'').localeCompare(b.time||''));
}
const categoryColor={'Leave':'rose','Meeting':'blue','Holiday':'rose','Follow-up':'violet','Task':'green','Milestone':'amber','Other':'blue'};
function calendarChip(item){
 return `<button class="cal-chip ${categoryColor[item.category]||'blue'}" data-act="${item.action}" data-key="${e(item.id)}" title="${e(item.title)}"><span>${item.time?e(eventTime(item.time))+' · ':''}${e(item.title)}</span></button>`;
}
function calendarGrid(days,entries,month){
 const weekdays=days.slice(0,7).map(date=>`<div class="cal-weekday">${calLabel(date,{weekday:'short'})}</div>`).join('');
 return '<div class="cal-grid">'+weekdays+days.map(date=>{
 const matching=entries.filter(item=>item.date===date);
 const visible=month?matching.slice(0,3):matching;
 return `<div class="cal-cell ${month&&date.slice(0,7)!==calendarDate.slice(0,7)?'outside':''} ${date===day()?'current':''}"><div class="cal-cell-head"><button class="cal-date" data-act="cal-day" data-key="${date}" aria-label="${calLabel(date,{dateStyle:'full'})}">${month?Number(date.slice(-2)):calLabel(date,{day:'numeric',month:'short'})}</button><button class="cal-add" ${isEmployee()?'hidden':''} data-act="cal-add" data-key="${date}" aria-label="Add event on ${date}">＋</button></div>${visible.map(calendarChip).join('')}${matching.length>visible.length?`<button class="cal-more" data-act="cal-day" data-key="${date}">+${matching.length-visible.length} more</button>`:''}</div>`;
 }).join('')+'</div>';
}
function weekGrid(start,entries){
 const days=Array.from({length:7},(_,i)=>calDay(start,i));
 const rows=Array.from({length:24},(_,hour)=>String(hour).padStart(2,'0'));
 const relative=entries.filter(item=>days.includes(item.date));
 const visibleHours=[...new Set([...rows.slice(8,20),...relative.filter(item=>item.time).map(item=>item.time.slice(0,2))])].sort();
 const now=new Date(Date.now()+330*60000), hourNow=String(now.getUTCHours()).padStart(2,'0');
 const cells=(slot,label)=>`<div class="week-label">${label}</div>`+days.map(date=>{
  const matches=relative.filter(item=>item.date===date&&(item.time||'').slice(0,2)===slot);
  return `<div class="week-slot ${date===day()?'current':''}">${date===day()&&slot===hourNow?`<span class="now-marker" style="--minute:${now.getUTCMinutes()/60*100}%" aria-label="Current time"></span>`:''}${matches.map(calendarChip).join('')}<button class="slot-add" ${isEmployee()?'hidden':''} data-act="cal-slot" data-key="${date}|${slot?slot+':00':''}" aria-label="Add event on ${date}${slot?' at '+slot+':00':''}">＋</button></div>`;
 }).join('');
 return `<div class="week-grid"><div class="cal-weekday">IST</div>${days.map(date=>`<button class="cal-weekday week-day" data-act="cal-day" data-key="${date}">${calLabel(date,{weekday:'short',day:'numeric'})}</button>`).join('')}${cells('','All day')}${visibleHours.map(hour=>cells(hour,hour+':00')).join('')}</div>`;
}
function calendar(){
 calendarDate||=day();
 calendarView||=typeof matchMedia==='function'&&matchMedia('(max-width:650px)').matches?'Agenda':'Month';
 const month=calendarDate.slice(0,7)+'-01', week=weekStart(calendarDate);
 const all=calendarEntries();
 const people=[...new Set(all.flatMap(assignees).filter(Boolean))].sort();
 const entries=all.filter(item=>(calendarFilter==='All'||item.category===calendarFilter)&&(!calendarPerson||assignedTo(item,calendarPerson))&&(!calendarProject||item.projectId===calendarProject));
 const personOptions='<option value="">Everyone</option>'+people.map(name=>`<option ${name===calendarPerson?'selected':''}>${e(name)}</option>`).join('');
 const projectOptions='<option value="">All projects</option>'+data.projects.map(item=>`<option value="${e(item.id)}" ${item.id===calendarProject?'selected':''}>${e(item.name)}</option>`).join('');

 let display,heading;
 if(calendarView==='Month'){
  heading=calLabel(month,{month:'long',year:'numeric'});
  display=calendarGrid(Array.from({length:42},(_,i)=>calDay(weekStart(month),i)),entries,true);
 }else if(calendarView==='Week'){
  heading=calLabel(week,{day:'numeric',month:'short'})+' – '+calLabel(calDay(week,6),{day:'numeric',month:'short',year:'numeric'});
  display=weekGrid(week,entries);
 }else{
  heading=calendarView==='Day'?calLabel(calendarDate,{dateStyle:'full'}):'From '+calLabel(calendarDate,{dateStyle:'medium'});
  const visible=entries.filter(item=>calendarView==='Day'?item.date===calendarDate:item.date>=calendarDate);
  display=visible.map(item=>listItem(item.title,[calLabel(item.date,{dateStyle:'medium'}),eventTime(item.time),item.endTime?eventTime(item.endTime):'',item.category,assigneeLabel(item)].filter(Boolean).join(' · '),btn('Open',item.action,item.id))).join('')||empty('No items scheduled for this view.');
 }
 ($('#my-calendar')||ui).innerHTML=title('Calendar','Meetings, deadlines and holidays · India Standard Time',isEmployee()?'':btn('＋ New event','cal-add',day(),true))+
 `<article class="panel calendar"><div class="calendar-tools"><div class="actions"><button data-act="cal-move" data-key="-1" aria-label="Previous period">‹</button><button data-act="cal-move" data-key="1" aria-label="Next period">›</button>${btn('Today','cal-today')}<h2>${heading}</h2></div><div class="actions"><label class="sr-only" for="cal-filter">Filter items</label><select id="cal-filter">${options(['All',...Object.keys(categoryColor)],calendarFilter)}</select><div class="segments" aria-label="Calendar view">${['Month','Week','Day','Agenda'].map(view=>`<button aria-pressed="${view===calendarView}" data-act="cal-view" data-key="${view}">${view}</button>`).join('')}</div></div></div><div class="toolbar calendar-filters"><select id="cal-person" aria-label="Filter by person">${personOptions}</select><select id="cal-project" aria-label="Filter by project">${projectOptions}</select></div>${display}</article>`;
 $('#cal-person').onchange=event=>{calendarPerson=event.target.value;calendar()};
 $('#cal-project').onchange=event=>{calendarProject=event.target.value;calendar()};
 $('#cal-filter').onchange=event=>{calendarFilter=event.target.value;calendar()};
}
function calendarAction(act,key){
 if(isEmployee()&&['cal-add','cal-slot'].includes(act))return;
 if(act==='cal-add'){openEvent('',key);return}
 if(act==='cal-slot'){const [date,time]=key.split('|');openEvent('',date,time);return}
 if(act==='cal-view')calendarView=key;
 if(act==='cal-today')calendarDate=day();
 if(act==='cal-day'){calendarDate=key;calendarView='Day'}
 if(act==='cal-move'){
  const step=Number(key);
  if(calendarView==='Month'){
   const date=new Date(calendarDate.slice(0,7)+'-01T12:00:00Z');
   date.setUTCMonth(date.getUTCMonth()+step);
   calendarDate=date.toISOString().slice(0,10);
  }else calendarDate=calDay(calendarDate,step*(calendarView==='Week'?7:calendarView==='Agenda'?30:1));
 }
 calendar();
}
function openEvent(key,date,time){
 const item=data.events.find(event=>event.id===key)||{id:id(),date:date||day(),time};
 if(isEmployee()){readRecord(e(item.title),'<p>'+e([item.date,item.time,item.endTime].filter(Boolean).join(' · '))+'</p><p>'+e(item.note)+'</p>');return}
 form(key?'Edit event':'New event',
  input('Event title','title',item.title,'text',true)+
  select('Type','category',options(['Meeting','Holiday','Other'],item.category||'Meeting'))+
  input('Date','date',item.date,'date',true)+
  '<div class="event-times">'+input('Start time (IST)','time',item.time,'time')+input('End time (IST)','endTime',item.endTime,'time')+'</div>'+
  select('Owner','owner',nameOptions(item.owner))+area('Notes or meeting link','note',item.note),
  'Save event',value=>{
   if(!value.title.trim())throw Error('Enter an event title.');
   if(value.endTime&&(!value.time||value.endTime<=value.time))throw Error('The end time must be after the start time.');
   Object.assign(item,value,{title:value.title.trim()});
   if(!key)data.events.push(item);
   calendarDate=item.date;
  });
}
