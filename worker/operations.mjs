const terminalLeadStatuses = new Set(['Do not contact','Not interested','Invalid number','Onboarded','Program listed']);
const leadOutcomes = new Set(['New','Contacted','Follow-up','Interested','Registered','Verified','Program listed','Onboarded','Not reachable','Not interested','Invalid number','Do not contact']);
const requestTypes = new Set(['Leave','Attendance correction']);
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
const todayIST = () => new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});
const cleanText = (value,limit) => typeof value === 'string' ? value.trim().slice(0,limit) : '';

function audit(state,access,action,subject) {
  state.activity = [{actor:access.name,action,subject,at:Date.now()},...(state.activity||[])].slice(0,100);
}


function deleteWorkspaceRecord(access,state,command){
 if(access.role!=='Super Admin')throw Error('Only the Super Admin can delete or restore tasks and leads.');
 if(command.type==='record-restore'){
  const item=(state.deletedRecords||[]).find(entry=>entry.id===command.id);
  if(!item)throw Error('This deleted item is unavailable.');
  const key=item.kind==='lead'?'leads':'tasks',record=structuredClone(item.record),tasks=structuredClone(item.tasks||[]);
  if(state[key].some(value=>value.id===record.id)||tasks.some(task=>state.tasks.some(value=>value.id===task.id)))throw Error('A record with this identifier already exists.');
  if(item.kind==='lead'&&state.leads.some(lead=>[lead.phone,lead.sheetSnapshot?.phone].some(value=>value&&[record.phone,record.sheetSnapshot?.phone].some(v=>v&&sheetPhone(v)===sheetPhone(value)))))throw Error('A lead with this phone already exists. Review it before restoring.');
  if(item.kind==='task'&&record.lead&&!state.leads.some(lead=>lead.id===record.lead))throw Error('Restore the linked lead before restoring this task.');
  if(item.kind==='task'){
   const lead=state.leads.find(lead=>lead.id===record.lead);
   if(lead?.suppressedTask?.taskId===record.id)delete lead.suppressedTask;
  }
  state[key].unshift(record);if(tasks.length)state.tasks.unshift(...tasks);
  state.deletedRecords=state.deletedRecords.filter(entry=>entry.id!==item.id);
  audit(state,access,'Restored '+item.kind,record.name||record.title);
  return;
 }
 if(!['task','lead'].includes(command.kind))throw Error('Choose a task or lead to delete.');
 const key=command.kind==='lead'?'leads':'tasks',record=state[key].find(item=>item.id===command.id);
 if(!record)throw Error('This record is unavailable. Refresh the workspace.');
 const snapshot=structuredClone(record);
 const stopTimer=task=>{if(task.timer){task.elapsed=(task.elapsed||0)+Math.max(0,Date.now()-task.timer);delete task.timer;}return task};
 if(command.kind==='task')stopTimer(snapshot);
 const tasks=command.kind==='lead'?state.tasks.filter(task=>task.lead===record.id).map(task=>stopTimer(structuredClone(task))):[];
 (state.deletedRecords||=[]).unshift({id:crypto.randomUUID(),kind:command.kind,record:snapshot,tasks,deletedAt:Date.now(),deletedBy:access.name});
 state[key]=state[key].filter(item=>item.id!==record.id);
 if(command.kind==='lead'){
  state.tasks=state.tasks.filter(task=>task.lead!==record.id);
  if(state.sheetQueue)delete state.sheetQueue[record.id];
 }else if(record.lead){
  const lead=state.leads.find(item=>item.id===record.lead);
  if(lead)lead.suppressedTask={taskId:record.id,action:lead.action||'',due:lead.due||''};
 }
 audit(state,access,'Deleted '+command.kind,record.name||record.title);
}

function operate(access,state,command,env={}) {
  if(command.type==='record-delete'||command.type==='record-restore'){deleteWorkspaceRecord(access,state,command);return;}
  const employee = access.role === 'Employee';
  if(command.type==='task-create'){
    const title=cleanText(command.title,200);if(!title||typeof command.id!=='string'||! /^[a-f0-9-]{36}$/i.test(command.id))throw Error('Enter a task description.');
    if(command.owners?.some(name=>name!==access.name))throw Error('Personal tasks must be assigned to you.');
    if(command.due&&!validDate(command.due))throw Error('Choose a valid due date.');
    if(!['None','Daily','Weekly','Monthly'].includes(command.repeat||'None'))throw Error('Choose a valid repeat schedule.');
    if(command.repeat&&command.repeat!=='None'&&!command.due)throw Error('Recurring tasks need a due date.');
    const existing=state.tasks.find(task=>task.id===command.id);if(existing){if(existing.createdBy===access.name&&existing.title===title)return;throw Error('This task identifier already exists.');}
    const hours=command.hours===''||command.hours==null?'':Number(command.hours);if(hours!==''&&(!Number.isFinite(hours)||hours<0||hours>1000))throw Error('Enter estimated hours between 0 and 1,000.');
    state.tasks.unshift({id:command.id,title,owner:access.name,owners:[access.name],createdBy:access.name,createdAt:Date.now(),due:command.due||'',priority:['Low','Medium','High','Urgent'].includes(command.priority)?command.priority:'Medium',status:'To do',repeat:command.repeat||'None',department:cleanText(command.department,60),hours,note:cleanText(command.note,3000)});
    audit(state,access,'Created personal task',title);
  }else if(command.type==='attendance'){
    if(access.role==='Founder')throw Error('Founder accounts do not track attendance.');
    if(!['in','out','break','lunch'].includes(command.action))throw Error('Choose a valid attendance action.');
    const records=access.role==='Super Admin'?(state.attendance||={}):((state.attendanceByUser||={})[access.user]||={});
    const record=records[todayIST()]||={},now=Date.now();
    if(command.action==='in'){if(record.in)throw Error('Already checked in today.');record.in=now;record.checkInIp=env.CLIENT_IP||null;}
    else {if(!record.in||record.out)throw Error('An active check-in is required.');
      if(command.action==='lunch'&&record.pause)throw Error('End the current break first.');
      if(command.action==='out'){record.out=now;record.checkOutIp=env.CLIENT_IP||null;}
      if(record.pause){record.breakMs=(record.breakMs||0)+now-record.pause;delete record.pause;}
      else if(command.action!=='out'){record.pause=now;record.breakKind=command.action==='lunch'?'Lunch':'Break';}
    }
  }else if(command.type==='work-comment'){
    const key=command.kind==='task'?'tasks':command.kind==='project'?'projects':null;
    const record=key&&scopedState(access)[key].find(item=>item.id===command.id);
    const actual=key&&state[key].find(item=>item.id===command.id);
    if(!record||!actual)throw Error('This work is unavailable.');
    if(typeof command.text!=='string'||command.text.length>2000)throw Error('Keep discussion updates within 2,000 characters.');
    const text=cleanText(command.text,2000);if(!text)throw Error('Write a comment first.');
    const members=command.kind==='task'?assignees(actual):[actual.owner,...(actual.members||[])];
    const mentions=Array.isArray(command.mentions)?[...new Set(command.mentions.filter(name=>members.includes(name)))]:[];
    const requestId=cleanText(command.commentId,80);if(!requestId)throw Error('Comment identifier required.');
    const prior=(actual.discussion||[]).find(item=>item.id===requestId);if(prior){if(prior.actor!==access.name||prior.text!==text||JSON.stringify(prior.mentions)!==JSON.stringify(mentions))throw Error('This comment identifier was already used.');return;}
    if((actual.discussion||[]).length>=200)throw Error('This discussion has reached 200 updates. Continue in Messages or a linked task.');
    actual.discussion=[...(actual.discussion||[]),{id:requestId,text,actor:access.name,at:Date.now(),mentions}];
    audit(state,access,'Commented on '+command.kind,actual.title||actual.name);
  }else if(command.type==='lead-research-complete'){
    completeLeadResearch(access,state,command);
  } else if (command.type === 'lead-outcome') {
    const lead = state.leads.find(item => item.id === command.id && (!employee || assignedTo(item,access.name)));
    if (!lead) throw Error('Lead is unavailable.');
    if (lead.researchReturnTo) throw Error('Send the expert details back to the founder before logging outreach.');
    if (lead.status === 'Do not contact' && employee) throw Error('This lead has opted out.');
    if (!leadOutcomes.has(command.status)) throw Error('Choose a valid outcome.');
    const due = command.due || '';
    const action = cleanText(command.action,160) || (due?'Follow-up':'');
    if ((action||due) && (terminalLeadStatuses.has(command.status)||!assignees(lead).length))
      throw Error('Next steps require an assigned, open lead.');
    if (due && (!validDate(due) || due < todayIST()))
      throw Error('Choose a follow-up date today or later.');
    const note = cleanText(command.note,3000);
    if(command.responsible){
      if(!assignedTo(lead,command.responsible))throw Error('Choose a responsible person from this lead’s assignees.');
      setAssignees(lead,responsibleFirst(assignees(lead),command.responsible));
    }
    for (const task of state.tasks.filter(item => item.lead === lead.id && item.status !== 'Done')) {
      task.status = 'Done';
      if (task.timer) task.elapsed = (task.elapsed||0) + Math.max(0,Date.now()-task.timer);
      delete task.timer;
    }
    const previousAction=lead.action||'';
    Object.assign(lead,{status:command.status,note,due,action});
    const method=['Call','WhatsApp','Email','Instagram','Other'].includes(command.method)?command.method:'';
    if(method)lead.method=method;
    if(action||command.status==='Follow-up')lead.sheetStage='Followup';
    else if(command.status==='Contacted'&&!lead.sheetStage)lead.sheetStage='Communication';
    const number=loggedFollowUps(lead).length+1;
    (lead.history ||= []).unshift({kind:'follow-up',number,date:todayIST(),status:lead.status,note,actor:access.name,method,previousAction,nextAction:action,nextDue:due,responsible:lead.owner});
    if (action) state.tasks.unshift({id:crypto.randomUUID(),title:action+' · '+lead.name,owner:assignees(lead)[0],owners:assignees(lead),due,priority:lead.priority||'Medium',status:'To do',lead:lead.id,note});
    audit(state,access,'Logged lead outcome',lead.name);
  } else if (command.type === 'request') {
    if(access.role==='Founder')throw Error('Founder accounts do not submit attendance or leave requests.');
    if (!requestTypes.has(command.kind) || !validDate(command.start) || !validDate(command.end) || command.end < command.start ||
        command.kind === 'Attendance correction' && command.start !== command.end) throw Error('Choose a valid date range for this request.');
    const note = cleanText(command.note,3000);
    if (!note) throw Error('Enter a reason for the request.');
    const time = value => typeof value==='string' && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value);
    const correction = command.kind==='Attendance correction' ? {in:command.checkIn,out:command.checkOut} : null;
    if (correction && (!time(correction.in)||!time(correction.out)||correction.out<=correction.in)) throw Error('Enter check-in and check-out times on the same day.');
    (state.requests ||= []).unshift({id:crypto.randomUUID(),user:access.user,owner:access.name,kind:command.kind,start:command.start,end:command.end,note,correction,status:'Pending',at:Date.now()});
    audit(state,access,'Submitted '+command.kind.toLowerCase(),access.name);
  } else if (command.type === 'decision') {
    if (employee || !['approve','return'].includes(command.decision)) throw Error('A founder or Super Admin must review this item.');
    const task = command.kind==='Task' && state.tasks.find(item=>item.id===command.id&&item.status==='In review');
    const request = command.kind==='Request' && (state.requests||[]).find(item=>item.id===command.id&&item.status==='Pending');
    if (!task && !request) throw Error('This item is no longer pending review.');
    if (request?.user === access.user) throw Error('Ask another reviewer to decide your request.');
    const note = cleanText(command.note,2000);
    if (command.decision==='return' && !note) throw Error('Add a reason before returning the item.');
    const approved = command.decision==='approve';
    if (task) {
      task.status = approved?'Done':'Rework';
      delete task.reviewAt;
      if (task.timer) task.elapsed=(task.elapsed||0)+Math.max(0,Date.now()-task.timer);
      delete task.timer;
      if (note) (task.comments ||= []).push(access.name+': '+note);
    }
    if (approved && request?.kind === 'Attendance correction') {
      if (!request.correction) throw Error('Ask the requester to submit the exact times in a new request.');
      const records = request.owner === 'Vansh' ? state.attendance : (state.attendanceByUser ||= {})[request.user] ||= {};
      const previous = records[request.start] || {};
      const stamp = time => Date.parse(request.start+'T'+time+':00+05:30');
      const checkIn=stamp(request.correction.in), checkOut=stamp(request.correction.out);
      records[request.start]={in:checkIn,out:checkOut,breakMs:Math.min(Math.max(0,previous.breakMs||0),checkOut-checkIn)};
    }
    if (request) Object.assign(request,{status:approved?'Approved':'Returned',decisionNote:note,reviewer:access.name,decisionAt:Date.now()});
    audit(state,access,approved?'Approved':'Returned',task?.title||request.kind+' · '+request.owner);
  } else throw Error('Unknown workspace action.');
}

function applyTaskResults(task, values) {
  for (const [key, limit] of [['actualOutput',1000],['proofUrl',1000]]) {
    if (!Object.hasOwn(values,key)) continue;
    const value = cleanText(values[key],limit);
    task[key] = key==='proofUrl' && !/^https?:\/\//i.test(value) ? '' : value;
  }
  for (const key of ['actualHours','kpiActual']) {
    if (!Object.hasOwn(values,key)) continue;
    const value = String(values[key] ?? '').trim();
    task[key] = value && Number.isFinite(Number(value)) && Number(value)>=0 ? Number(value) : '';
  }
}

function advanceRecurringTasks(state){
  const added=[];
  for(const task of state.tasks){
    if(task.status!=='Done'||task.nextOccurrence||task.lead||!validDate(task.due)||!['Daily','Weekly','Monthly'].includes(task.repeat))continue;
    const due=new Date(task.due+'T12:00:00Z');
    if(task.repeat==='Monthly'){
      const wanted=Number.isInteger(task.repeatDay)&&task.repeatDay>=1&&task.repeatDay<=31?task.repeatDay:due.getUTCDate();
      due.setUTCDate(1);due.setUTCMonth(due.getUTCMonth()+1);
      const last=new Date(Date.UTC(due.getUTCFullYear(),due.getUTCMonth()+1,0)).getUTCDate();
      due.setUTCDate(Math.min(wanted,last));
    }else due.setUTCDate(due.getUTCDate()+(task.repeat==='Daily'?1:7));
    const date=due.toISOString().slice(0,10);
    const {title,owner,priority,note,projectId,hours,repeat,department,taskType,expectedOutput,kpi,kpiTarget,kpiUnit,kpiRollup}=task;
    const id=crypto.randomUUID();
    task.nextOccurrence=id;
    added.push({id,title,owner,...(Array.isArray(task.owners)?{owners:assignees(task)}:{}),priority,note,projectId,hours,repeat,department,taskType,expectedOutput,kpi,kpiTarget,kpiUnit,kpiRollup,plannedDate:date,repeatDay:task.repeatDay||Number(task.due.slice(-2)),status:'To do',start:date,due:date,
      checklist:(Array.isArray(task.checklist)?task.checklist:[]).filter(item=>typeof item?.text==='string').map(item=>({text:item.text,done:false}))});
  }
  state.tasks.unshift(...added);
}

function groupExpertOnboardingTasks(state) {
  const tasks=state.tasks.filter(task=>typeof task.lead==='string'&&task.lead.trim());
  if(!tasks.length)return;
  let project=state.projects.find(item=>item.id==='expert-onboarding')||
    state.projects.find(item=>String(item.name??'').trim().toLowerCase()==='expert onboarding');
  if(!project){
    project={id:'expert-onboarding',name:'Expert Onboarding',owner:'Vansh',members:[],milestones:[]};
    state.projects.unshift(project);
  }
  for(const task of tasks)task.projectId=project.id;
}

function completeLeadResearch(access,state,command) {
  const lead=state.leads.find(item=>item.id===command.id);
  if(!lead?.researchReturnTo||!assignedTo(lead,access.name))throw Error('This research handoff is unavailable.');
  const name=cleanText(command.name,160);
  const phone=cleanText(command.phone,40);
  const rawInstagram=cleanText(command.instagram,200);
  const instagram=leadInstagram(rawInstagram);
  const area=cleanText(command.area,250);
  const researchNotes=cleanText(command.researchNotes,3000);
  if(!name||(phone&&!sheetPhone(phone))||(rawInstagram&&!instagram))throw Error('Check the name, phone number and Instagram profile.');
  if(lead.sheetSnapshot?.phone&&!phone)throw Error('Keep a phone number on leads already synced to Google Sheets.');
  if(!phone&&!instagram&&!researchNotes)throw Error('Add a contact detail or a note about what you found.');
  if(state.leads.some(item=>item!==lead&&((phone&&sheetPhone(item.phone)===sheetPhone(phone))||
    (instagram&&leadInstagram(item.instagram)===instagram))))throw Error('Another lead already uses this phone or Instagram profile.');
  const founder=lead.researchReturnTo;
  const due=todayIST();
  const action=phone?'Initial call':instagram?'Follow up on Instagram':'Review expert research';
  for(const task of state.tasks.filter(item=>item.lead===lead.id&&item.status!=='Done')){
    task.status='Done';
    if(task.timer)task.elapsed=(task.elapsed||0)+Math.max(0,Date.now()-task.timer);
    delete task.timer;
  }
  Object.assign(lead,{name,phone,instagram,area,researchNotes,action,due});
  setAssignees(lead,[founder]);
  delete lead.researchReturnTo;
  state.tasks.unshift({id:crypto.randomUUID(),title:action+' · '+name,lead:lead.id,
    owner:founder,owners:[founder],due,status:'To do',priority:lead.priority||'Medium',
    note:researchNotes,handoffReady:true});
  audit(state,access,'Returned expert details to '+founder,name);
}

async function workspacePresence(request,env) {
  const access=await accessFor(request,env.DB);
  if(!access?.state)return json({error:'Workspace seat required.'},403);
  const date=todayIST();
  if(request.method==='GET'){
    if(access.role!=='Super Admin')return json({error:'Super Admin access required.'},403);
    const {results}=await env.DB.prepare('select name, section, last_seen, host(last_ip) as ip, minutes_by_section from public.workspace_presence where workspace_id = ? and work_day = ? order by last_seen desc').bind(access.workspace,date).all();
    return json({people:results});
  }
  if(request.method!=='POST'||request.headers.get('Origin')!==new URL(request.url).origin)
    return json({error:'Invalid presence request.'},403);
  const body=await readPayload(request).catch(()=>null);
  if(!['Home','Operations','Marketing','Sales','Team','Messages','Settings'].includes(body?.section))
    return json({error:'Invalid workspace section.'},400);
  const now=Date.now();
  await env.DB.prepare(`
    insert into public.workspace_presence(workspace_id,user_id,work_day,name,section,last_seen,last_ip)
    values (?,?,?,?,?,?,?::inet)
    on conflict (workspace_id,user_id,work_day) do update set
      name=excluded.name,section=excluded.section,last_seen=excluded.last_seen,
      last_ip=coalesce(excluded.last_ip,workspace_presence.last_ip),
      minutes_by_section=case when excluded.last_seen-workspace_presence.last_seen between 45000 and 90000
        then jsonb_set(workspace_presence.minutes_by_section,array[workspace_presence.section],
          to_jsonb(coalesce((workspace_presence.minutes_by_section->>workspace_presence.section)::int,0)+1))
        else workspace_presence.minutes_by_section end
    where excluded.last_seen-workspace_presence.last_seen>=45000
  `).bind(access.workspace,access.user,date,access.name,body.section,now,env.CLIENT_IP||null).run();
  await env.DB.prepare("delete from public.workspace_presence where workspace_id = ? and user_id = ? and work_day < current_date - 30")
    .bind(access.workspace,access.user).run();
  return json({ok:true});
}
