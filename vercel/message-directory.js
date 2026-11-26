import {createHash} from 'node:crypto';
// The backend reads its verified member directory, never the protected Auth schema.
export async function workspaceMessageDirectory(access,db){
 const seats=access.seats.filter(seat=>seat.name&&seat.email).map(seat=>({...seat,email:seat.email.trim().toLowerCase()}));
 const emails=[...new Set(seats.map(seat=>seat.email))],placeholders=emails.map(()=>'?').join(',');
 const {results}=await db.prepare('select user_id as id, lower(email) as email from public.message_members where '+(emails.length?'lower(email) in ('+placeholders+') or ':'')+'user_id = ?').bind(...emails,access.workspace).all();
 const accounts=new Map(results.map(user=>[user.email,user]));
 const members=seats.map(seat=>{const account=accounts.get(seat.email);return {id:account?.id||'seat-'+createHash('sha256').update(seat.email).digest('hex').slice(0,32),email:seat.email,name:seat.name,role:seat.role,available:Boolean(account)}});
 const owner=results.find(user=>user.id===access.workspace);
 if(owner&&!members.some(member=>member.id===owner.id))members.push({id:owner.id,email:owner.email,name:access.state?.people?.find(person=>person.role==='Administrator')?.name||'Vansh',role:'Super Admin',available:true});
 return [...new Map(members.map(member=>[member.id,member])).values()].sort((a,b)=>a.name.localeCompare(b.name));
}
export async function registerMessageMember(user,db){
 await db.prepare('INSERT INTO message_members (user_id,email,display_name) VALUES (?,?,?) ON CONFLICT (user_id) DO UPDATE SET email=excluded.email').bind(user.id,user.email,user.email.split('@')[0]).run();
}
