const maxPayloadBytes = 1_900_000;
const recordLists = ['people', 'leads', 'tasks', 'projects', 'events', 'messages', 'reviews'];
const privateHeaders = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };

function json(body, status = 200) {
  return Response.json(body, { status, headers: privateHeaders });
}

async function readPayload(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('A request body is required.');
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxPayloadBytes) {
      await reader.cancel();
      throw new Error('Workspace storage is full. Remove large attachments before adding more.');
    }
    text += decoder.decode(value, { stream: true });
  }
  return JSON.parse(text + decoder.decode());
}

async function workspace(request, env) {
  if (!request.headers.get('oai-authenticated-user-id')) return json({error:'Sign in to access the workspace.'},401);
  const access = await accessFor(request, env.DB);
  if (!access) return json({ error: 'A Super Admin must assign your sign-in email to a workspace seat.' }, 403);
  if (request.method === 'GET') {
    const version=encodeURIComponent(JSON.stringify([access.revision,access.role,access.name]));
    if(request.headers.get('X-Workspace-Version')===version)
      return new Response(null,{status:204,headers:privateHeaders});
    return json({ revision: access.revision, data: scopedState(access), role: access.role, name: access.name,
      ...(access.role === 'Super Admin' ? { seats: access.seats } : {}) });
  }
  if (request.method !== 'PUT') return json({ error: 'Method not allowed.' }, 405);
  if (request.headers.get('Origin') !== new URL(request.url).origin || !request.headers.get('Content-Type')?.startsWith('application/json')) {
    return json({ error: 'Save requests must come from this workspace.' }, 403);
  }
  let update;
  try {
    update = await readPayload(request);
  } catch (error) {
    return json({ error: error instanceof SyntaxError ? 'Invalid workspace data.' : error.message }, 400);
  }
  const { data, revision, command } = update || {};
  if (!Number.isSafeInteger(revision) || revision < 0 || !data || !recordLists.every(key => Array.isArray(data[key]) && data[key].every(record => record && typeof record === 'object' && !Array.isArray(record))) ||
      !data.attendance || typeof data.attendance !== 'object' || Array.isArray(data.attendance)) {
    return json({ error: 'Invalid workspace update.' }, 400);
  }
  if (revision !== access.revision) return json({ error: 'The workspace changed in another tab. Reload to get the latest records.' }, 409);
  if (!command && access.role !== 'Employee') access.priorLeadOwners = new Map((access.state?.leads||[]).map(lead=>[lead.id,assigneeLabel(lead)]));
  const protectedDeletedRecords=structuredClone(access.state?.deletedRecords||[]);
  const priorTasks = new Map((access.state?.tasks || []).map(task=>[task.id,{status:task.status,completedAt:task.completedAt,completedBy:task.completedBy,assignedAt:task.assignedAt,statusChangedAt:task.statusChangedAt,statusChangedBy:task.statusChangedBy,owners:assigneeLabel(task)}]));
  const priorLeads = new Map((access.state?.leads||[]).map(lead=>[lead.id,{...lead}]));
  const priorAttendanceEvents=structuredClone(access.state?.attendanceEvents||[]);
  const previousAttendance=structuredClone(access.role==='Super Admin'?access.state?.attendance||{}:access.state?.attendanceByUser?.[access.user]||{});
  let next;
  if (command) {
    next = access.state || {...data,seats:access.seats,orgKey:'svaveda'};
    try {operate(access,next,command,env)} catch (error) {return json({error:error.message},400)}
  } else if (access.role === 'Super Admin') {
    try {
      const seats = data.seats && JSON.stringify(data.seats)!==JSON.stringify(access.seats)
        ? validateSeats(data.seats, access.email, access.seats) : access.seats;
      next = {...data,seats,orgKey:'svaveda',attendanceByUser:access.state?.attendanceByUser || {},requests:access.state?.requests||[],activity:access.state?.activity||[]};
    } catch (error) {
      return json({ error:error.message }, 400);
    }
  } else next = mergeTeamState(access,data);
  if(!command){
    next.deletedRecords=protectedDeletedRecords;
    if([...priorLeads.keys()].some(id=>!next.leads.some(lead=>lead.id===id))||[...priorTasks.keys()].some(id=>!next.tasks.some(task=>task.id===id)))
      return json({error:'Use the Super Admin Delete action to remove tasks or leads.'},403);
    if(next.leads.some(lead=>!priorLeads.has(lead.id)&&((next.deletedRecords||[]).some(item=>item.kind==='lead'&&item.record.id===lead.id)||deletedSheetLead(next,sheetPhone(lead.phone)))))
      return json({error:'This lead is in Deleted items. Ask the Super Admin to restore it.'},400);
  }
  if(next.tasks.some(task=>(next.deletedRecords||[]).some(item=>item.kind==='task'?item.record.id===task.id:(item.tasks||[]).some(deleted=>deleted.id===task.id))))
    return json({error:'This task is in Deleted items. Ask the Super Admin to restore it.'},400);
  if (!command && access.role !== 'Employee' && access.state) {
    if (access.role === 'Super Admin' && JSON.stringify(next.seats)!==JSON.stringify(access.seats)) audit(next,access,'Updated role seats','Roles & Access');
    for (const lead of next.leads) {
      const prior = access.priorLeadOwners?.get(lead.id);
      if (prior !== undefined && prior !== assigneeLabel(lead)) audit(next,access,'Reassigned lead',lead.name);
    }
  }
  if (!command && access.role !== 'Employee') {
    for (const task of next.tasks) if (task.status==='In review'&&!task.reviewAt) task.reviewAt=Date.now();
  }
  next.sheetQueue=Object.assign(Object.create(null),access.state?.sheetQueue);
  if(next.sheetLink!==access.state?.sheetLink)next.sheetQueue=Object.create(null);
  for(const id of Object.keys(next.sheetQueue))if(!next.leads.some(lead=>lead.id===id))delete next.sheetQueue[id];
  if(next.sheetLink&&command?.type!=='record-restore'){
    for(const lead of next.leads){
      if(typeof lead.id!=='string'||!lead.id||lead.id.length>128)continue;
      const prior=priorLeads.get(lead.id);
      if(!prior&&lead.source==='Google Sheets')continue;
      if(lead.quickCaptured&&!sheetPhone(lead.phone)&&!lead.sheetSnapshot)continue;
      if(prior&&JSON.stringify(prior.sheetSnapshot)!==JSON.stringify(lead.sheetSnapshot))continue;
      const changed=Object.keys(sheetWriteFields).filter(field=>sheetLeadValue(lead,field)!==sheetLeadValue(prior,field));
      if(changed.length){
        const pending=next.sheetQueue[lead.id]?.fields;
        next.sheetQueue[lead.id]={attempts:0,nextAt:0,fields:[...new Set([...(pending||[]),...changed])]};
      }
    }
  }
  for (const task of next.tasks) {
    const prior = priorTasks.get(task.id);
    const now=Date.now();
    if (assigneeLabel(task) && assigneeLabel(task)!==prior?.owners){task.assignedAt=now;task.assignedBy=access.name;}
    else if (prior?.assignedAt) task.assignedAt=prior.assignedAt;
    else delete task.assignedAt;
    if (task.status!==prior?.status){task.statusChangedAt=now;task.statusChangedBy=access.name;}
    else if (prior?.statusChangedAt) task.statusChangedAt=prior.statusChangedAt;
    else delete task.statusChangedAt;
    if (task.status === 'Done' && prior?.status !== 'Done') {
      task.completedAt=now;
      task.completedBy=access.name;
    } else if (task.status==='Done' && prior?.completedAt) {
      task.completedAt=prior.completedAt;
      if(prior.completedBy)task.completedBy=prior.completedBy;
      else delete task.completedBy;
    } else {
      delete task.completedAt;
      delete task.completedBy;
    }
  }
  next.attendanceEvents=priorAttendanceEvents;
  const attendance=access.role==='Super Admin'?next.attendance:next.attendanceByUser?.[access.user];
  if(access.role!=='Founder'&&attendance){
   const date=todayIST(),before=previousAttendance[date]||{},after=attendance[date]||{};
   const events=[];
   if(after.in&&!before.in)events.push('Checked in');
   if(after.out&&!before.out)events.push('Checked out');
   if(after.pause&&!before.pause)events.push(after.breakKind==='Lunch'?'Lunch started':'Break started');
   if(before.pause&&!after.pause)events.push(before.breakKind==='Lunch'?'Lunch ended':'Break ended');
   for(const kind of events)(next.attendanceEvents||=[]).unshift({id:crypto.randomUUID(),kind,actor:access.name,at:Date.now(),date});
   if(next.attendanceEvents)next.attendanceEvents=next.attendanceEvents.slice(0,500);
  }
  groupExpertOnboardingTasks(next);
  advanceRecurringTasks(next);
  // Sync status is derived for responses, never accepted as stored user data.
  for(const lead of next.leads)delete lead.syncState;
  const payload = JSON.stringify(next);
  if (new TextEncoder().encode(payload).length > maxPayloadBytes) return json({ error:'Workspace storage limit reached.' }, 413);
  const user = access.workspace;
  const result = revision === 0
    ? await env.DB.prepare('INSERT INTO workspace_state (workspace_id, revision, payload) VALUES (?, 1, ?) ON CONFLICT (workspace_id) DO NOTHING').bind(user, payload).run()
    : await env.DB.prepare('UPDATE workspace_state SET revision = revision + 1, payload = ?, updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ? AND revision = ?').bind(payload, user, revision).run();
  if (!result.meta.changes) return json({ error: 'The workspace changed in another tab. Reload to get the latest records.' }, 409);
  return json({ revision: revision + 1, data: scopedState({...access,state:next}) });
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === '/api/sheets/cron' && env.SHEET_CRON_AUTHORIZED === true) return backgroundSheetSync(env);
    if (path === '/api/sheets/process') {
      if (request.method !== 'POST' || request.headers.get('Origin') !== new URL(request.url).origin)
        return json({error:'Invalid sync request.'},403);
      const access=await accessFor(request,env.DB);
      if (!access?.state) return json({error:'Workspace seat required.'},403);
      return runScheduledSheetSync(env,access.workspace);
    }
    if(path==='/api/notes'||path==='/api/team-attendance')return workspaceExtras(request,env,path);
    if (path === '/api/presence') return workspacePresence(request,env);
    if (path === '/api/sheets/preview') return previewSheet(request,env);
    if (path === '/api/workspace' || path === '/api/messages' || path === '/api/messages/join' || path.startsWith('/api/messages/files/')) {
      try {
        return path === '/api/workspace' ? await workspace(request, env) : await messages(request, env, path);
      } catch (error) {
        console.error('Workspace request failed', error);
        return json({ error: 'Workspace storage is temporarily unavailable.' }, 503);
      }
    }
    const asset = Object.hasOwn(assets, path) ? assets[path] : null;
    if (!asset) return new Response('Page not found', { status: 404 });
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405 });
    return new Response(request.method === 'HEAD' ? null : asset.encoding==='base64'?Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0)):asset.body, {
      headers: { ...privateHeaders, 'Content-Type': asset.mime }
    });
  }
};
