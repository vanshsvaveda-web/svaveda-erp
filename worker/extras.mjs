async function workspaceExtras(request,env,path){
 const access=await accessFor(request,env.DB);if(!access?.state)return json({error:'Workspace seat required.'},403);
 if(path==='/api/notes'){
  if(request.method==='GET'){
   const {results}=await env.DB.prepare('select id,body,created_at,updated_at from public.workspace_notes where workspace_id=? and user_id=? order by updated_at desc limit 100').bind(access.workspace,access.user).all();
   return json({notes:results});
  }
  if(request.method!=='POST'||request.headers.get('Origin')!==new URL(request.url).origin)return json({error:'Invalid note request.'},403);
  const value=await readPayload(request);if(typeof value.id!=='string'||! /^[a-f0-9-]{36}$/i.test(value.id)||typeof value.body!=='string'||!value.body.trim()||value.body.length>5000)return json({error:'Write a note within 5,000 characters.'},400);
  const count=await env.DB.prepare('select count(*)::int as count from public.workspace_notes where workspace_id=? and user_id=?').bind(access.workspace,access.user).first();
  if(count.count>=100){const existing=await env.DB.prepare('select id from public.workspace_notes where workspace_id=? and user_id=? and id=?').bind(access.workspace,access.user,value.id).first();if(!existing)return json({error:'You have 100 notes. Edit an existing note to continue.'},400)}
  const now=Date.now();await env.DB.prepare('insert into public.workspace_notes(workspace_id,user_id,id,body,created_at,updated_at) values (?,?,?,?,?,?) on conflict(workspace_id,user_id,id) do update set body=excluded.body,updated_at=excluded.updated_at').bind(access.workspace,access.user,value.id,value.body.trim(),now,now).run();return json({saved:true});
 }
 if(path==='/api/team-attendance'){
  if(access.role==='Employee')return json({error:'Founder or Super Admin access required.'},403);
  if(request.method!=='GET')return json({error:'Method not allowed.'},405);
  const month=new URL(request.url).searchParams.get('month')||todayIST().slice(0,7);if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return json({error:'Choose a valid month.'},400);
  const directory=await env.MESSAGE_DIRECTORY(access);
  const people=directory.filter(person=>person.role!=='Founder').map(person=>{
   const records=person.id===access.workspace?access.state.attendance||{}:access.state.attendanceByUser?.[person.id]||{};
   return {name:person.name,records:Object.entries(records).filter(([date])=>date.startsWith(month)).map(([date,record])=>(access.role==='Super Admin'?{date,...record}:Object.fromEntries(Object.entries({date,...record}).filter(([key])=>!['checkInIp','checkOutIp'].includes(key)))))};
  });return json({month,people});
 }
 return json({error:'Not found.'},404);
}
