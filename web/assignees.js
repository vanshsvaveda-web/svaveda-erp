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
