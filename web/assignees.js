function assignees(record) {
  const names = Array.isArray(record?.owners) ? record.owners : [record?.owner];
  return [...new Set(names.filter(name=>typeof name==='string').map(name=>name.trim()).filter(Boolean))];
}

const assignedTo = (record,name) => Boolean(name && assignees(record).includes(name));
const assigneeLabel = record => assignees(record).join(', ');

function setAssignees(record,names) {
  record.owners = assignees({owners:names});
  record.owner = record.owners[0] || '';
}

function responsibleFirst(names,responsible){
 const people=assignees({owners:names});
 if(responsible&&!people.includes(responsible))throw Error('The responsible person must also be selected as an assignee.');
 return responsible?[responsible,...people.filter(name=>name!==responsible)]:people;
}
function personalWorkQueues(state,name,today){
 const mine=state.tasks.filter(task=>assignedTo(task,name));
 const rank={Urgent:0,High:1,Medium:2,Low:3};
 const sort=(a,b)=>(a.due||'9999').localeCompare(b.due||'9999')||(rank[a.priority]??2)-(rank[b.priority]??2);
 return {'Next up':mine.filter(task=>['To do','Rework'].includes(task.status)).sort(sort),'In progress':mine.filter(task=>task.status==='In progress').sort(sort),Waiting:mine.filter(task=>['Blocked','On hold','In review'].includes(task.status)).sort(sort),Completed:mine.filter(task=>task.status==='Done').sort((a,b)=>(Number(b.completedAt)||0)-(Number(a.completedAt)||0))};
}

// A personal workload contains one entry per project, plus individual tasks.
function personalTodoSummary(state,name){
 const mine=(state.tasks||[]).filter(task=>assignedTo(task,name));
 const projects=new Map((state.projects||[]).map(project=>[project.id,project]));
 const onboarding=(state.projects||[]).find(project=>project.id==='expert-onboarding'||project.name?.trim().toLowerCase()==='expert onboarding');
 const groups=new Map(),individual=[];
 for(const task of mine){
  const project=projects.get(task.projectId)||(task.lead?(onboarding||{id:'',name:'Expert Onboarding'}):null);
  if(!project){individual.push(task);continue}
  const key=project.id||'lead-work';
  if(!groups.has(key))groups.set(key,{project,tasks:[]});
  groups.get(key).tasks.push(task);
 }
 const summaries=[...groups.values()].map(group=>{
  const pending=group.tasks.filter(task=>task.status!=='Done'),done=group.tasks.length-pending.length;
  const dates=pending.map(task=>task.due).filter(Boolean).sort();
  const status=!pending.length?'Done':pending.some(task=>task.status==='In progress')?'In progress':pending.every(task=>task.status==='In review')?'In review':pending.every(task=>['On hold','Blocked'].includes(task.status))?'On hold':'To do';
  return {...group,pending:pending.length,done,due:dates[0]||'',status,ongoing:group.tasks.some(task=>task.lead||task.repeat&&task.repeat!=='None')};
 }).sort((a,b)=>(a.status==='Done')-(b.status==='Done')||(a.due||'9999').localeCompare(b.due||'9999')||String(a.project.name).localeCompare(String(b.project.name)));
 return {projects:summaries,tasks:individual.sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999'))};
}

function personalTodoView(state,name,view,today){
 const summary=personalTodoSummary(state,name);
 const include=task=>view==='Completed'?task.status==='Done':task.status!=='Done'&&(view==='Upcoming'?Boolean(task.due&&task.due>today):!task.due||task.due<=today);
 return {projects:summary.projects.filter(group=>group.tasks.some(include)).map(group=>({...group,viewDue:group.tasks.filter(include).map(task=>task.due).filter(Boolean).sort()[0]||''})),tasks:summary.tasks.filter(include)};
}
function dailyWorkProgress(state,name,today){
 const mine=(state.tasks||[]).filter(task=>assignedTo(task,name));
 const done=mine.filter(task=>task.status==='Done'&&(task.completedAt?new Date(task.completedAt+330*60000).toISOString().slice(0,10)===today:task.due===today)).length;
 const pending=mine.filter(task=>task.status!=='Done'&&(!task.due||task.due<=today)).length;
 return {done,total:pending+done};
}

function leadTaskSuppressed(lead){
 return Boolean(lead?.suppressedTask&&lead.suppressedTask.action===(lead.action||'')&&lead.suppressedTask.due===(lead.due||''));
}

function notificationsAfterReset(entries,reset){
 const at=Number(reset?.at);
 if(!Number.isFinite(at)||at<=0)return entries;
 const dismissed=new Set(Array.isArray(reset.ids)?reset.ids:[]);
 return entries.filter(item=>!dismissed.has(item.id)&&(!(Number(item.at)>0)||Number(item.at)>at));
}
