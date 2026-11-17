const terminalLeadStatuses = new Set(['Do not contact','Not interested','Invalid number','Onboarded','Program listed']);
const leadOutcomes = new Set(['New','Contacted','Follow-up','Interested','Registered','Verified','Program listed','Onboarded','Not reachable','Not interested','Invalid number','Do not contact']);
const requestTypes = new Set(['Leave','Attendance correction']);
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
const todayIST = () => new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});
const cleanText = (value,limit) => typeof value === 'string' ? value.trim().slice(0,limit) : '';

function audit(state,access,action,subject) {
  state.activity = [{actor:access.name,action,subject,at:Date.now()},...(state.activity||[])].slice(0,100);
}

function operate(access,state,command) {
  const employee = access.role === 'Employee';
  if (command.type === 'lead-contact') {
    const lead = state.leads.find(item=>item.id===command.id && (!employee || item.owner===access.name));
    if (!lead || ['Do not contact','Invalid number'].includes(lead.status) ||
        !['Call','WhatsApp'].includes(command.method)) throw Error('Contact action is unavailable.');
    lead.method=command.method;
    if (!lead.sheetStage || lead.sheetStage==='Followup') lead.sheetStage='Communication';
    if (lead.status==='New') lead.status='Contacted';
    (lead.history ||= []).unshift({date:todayIST(),status:lead.status,actor:access.name,method:command.method,
      note:command.method==='Call'?'Opened call dialer':'Opened WhatsApp conversation'});
    lead.history=lead.history.slice(0,50);
    audit(state,access,'Opened '+command.method,lead.name);
  } else if (command.type === 'lead-outcome') {
    const lead = state.leads.find(item => item.id === command.id && (!employee || item.owner === access.name));
    if (!lead) throw Error('Lead is unavailable.');
    if (lead.status === 'Do not contact' && employee) throw Error('This lead has opted out.');
    if (!leadOutcomes.has(command.status)) throw Error('Choose a valid outcome.');
    const due = command.due || '';
    if (due && (!validDate(due) || due < todayIST() || !lead.owner || terminalLeadStatuses.has(command.status))) {
      throw Error('Choose a follow-up date today or later for an assigned, open lead.');
    }
    const note = cleanText(command.note,3000);
    for (const task of state.tasks.filter(item => item.lead === lead.id && item.status !== 'Done')) {
      task.status = 'Done';
      if (task.timer) task.elapsed = (task.elapsed||0) + Math.max(0,Date.now()-task.timer);
      delete task.timer;
    }
    Object.assign(lead,{status:command.status,note,due,action:due?'Follow-up':''});
    const method=['Call','WhatsApp','Email','Instagram','Other'].includes(command.method)?command.method:'';
    if(method)lead.method=method;
    if(command.status==='Follow-up')lead.sheetStage='Followup';
    (lead.history ||= []).unshift({date:todayIST(),status:lead.status,note,actor:access.name,method});
    if (due) state.tasks.unshift({id:crypto.randomUUID(),title:'Follow-up · '+lead.name,owner:lead.owner,due,priority:lead.priority||'Medium',status:'To do',lead:lead.id,note});
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
    if (request) Object.assign(request,{status:approved?'Approved':'Returned',decisionNote:note,reviewer:access.name});
    audit(state,access,approved?'Approved':'Returned',task?.title||request.kind+' · '+request.owner);
  } else throw Error('Unknown workspace action.');
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
    const {title,owner,priority,note,projectId,hours,repeat}=task;
    const id=crypto.randomUUID();
    task.nextOccurrence=id;
    added.push({id,title,owner,priority,note,projectId,hours,repeat,repeatDay:task.repeatDay||Number(task.due.slice(-2)),status:'To do',start:date,due:date,
      checklist:(Array.isArray(task.checklist)?task.checklist:[]).filter(item=>typeof item?.text==='string').map(item=>({text:item.text,done:false}))});
  }
  state.tasks.unshift(...added);
}
