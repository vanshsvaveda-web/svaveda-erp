import {createHash} from 'node:crypto';

// Resolve only configured seats and this workspace's owner. No auth credentials
// or account emails are sent to the browser by the message API.
export async function workspaceMessageDirectory(access,db){
 const seats=access.seats.filter(seat=>seat.name&&seat.email).map(seat=>({...seat,email:seat.email.trim().toLowerCase()}));
 const emails=[...new Set(seats.map(seat=>seat.email))];
 const placeholders=emails.map(()=>'?').join(',');
 const {results}=await db.prepare('select id::text as id, lower(email) as email, email_confirmed_at, banned_until from auth.users where deleted_at is null and ('+(emails.length?'lower(email) in ('+placeholders+') or ':'')+'id::text = ?)').bind(...emails,access.workspace).all();
 const accounts=new Map(results.map(user=>[user.email,user]));
 const members=seats.map(seat=>{
  const account=accounts.get(seat.email);
  return {id:account?.id||'seat-'+createHash('sha256').update(seat.email).digest('hex').slice(0,32),email:seat.email,name:seat.name,role:seat.role,
   available:Boolean(account?.email_confirmed_at)&&(!account.banned_until||Date.parse(account.banned_until)<=Date.now())};
 });
 const owner=results.find(user=>user.id===access.workspace);
 if(owner&&!members.some(member=>member.id===owner.id))members.push({id:owner.id,email:owner.email,name:access.state?.people?.find(person=>person.role==='Administrator')?.name||'Vansh',role:'Super Admin',available:Boolean(owner.email_confirmed_at)&&(!owner.banned_until||Date.parse(owner.banned_until)<=Date.now())});
 return [...new Map(members.map(member=>[member.id,member])).values()].sort((a,b)=>a.name.localeCompare(b.name));
}
