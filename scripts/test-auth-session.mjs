import assert from 'node:assert/strict';
import {identity,signIn,signOut,withSessionCookies} from '../vercel/auth.js';
process.env.SUPABASE_URL='https://auth.example.invalid';process.env.SUPABASE_PUBLISHABLE_KEY='synthetic-key';
const original=globalThis.fetch,user={id:'test-user',email:'test@example.invalid',email_confirmed_at:'2026-01-01'};
let calls=[],mode='ok';
globalThis.fetch=async(url,options)=>{calls.push({url:String(url),options});if(String(url).endsWith('/user'))return mode==='transient'?new Response('',{status:503}):options.headers.Authorization==='Bearer valid'?Response.json(user):new Response('',{status:401});
 if(mode==='revoked')return new Response('',{status:400});if(mode==='transient')return new Response('',{status:503});return Response.json({user,access_token:'new-access',refresh_token:'new-refresh',expires_in:3600})};
const request=cookie=>new Request('https://erp.example.invalid/',{headers:{Cookie:cookie}});
try{
 let cookies=[];assert.equal(await identity(request(''),cookies),null);assert.equal(calls.length,0);
 assert.deepEqual(await identity(request('__Host-svaveda-session=valid'),cookies),user);assert.equal(cookies.length,0);
 assert.deepEqual(await identity(request('__Host-svaveda-session=expired; __Host-svaveda-refresh=rotate-one'),cookies),user);assert.equal(cookies.length,2);assert.ok(cookies.every(c=>c.includes('HttpOnly; Secure; SameSite=Lax')));assert.match(cookies[1],/Max-Age=34560000/);
 const refreshed=withSessionCookies(new Response('private',{headers:{'Cache-Control':'no-store'}}),cookies);assert.equal(refreshed.headers.getSetCookie().length,2);assert.equal(await refreshed.text(),'private');
 calls=[];const pair=await Promise.all([identity(request('__Host-svaveda-refresh=parallel')),identity(request('__Host-svaveda-refresh=parallel'))]);assert.ok(pair.every(u=>u.id===user.id));assert.equal(calls.length,1,'concurrent rotation shares the token request');
 mode='revoked';cookies=[];assert.equal(await identity(request('__Host-svaveda-refresh=revoked'),cookies),null);assert.ok(cookies.every(c=>c.endsWith('Max-Age=0')));
 mode='transient';cookies=[];await assert.rejects(identity(request('__Host-svaveda-session=expired; __Host-svaveda-refresh=unavailable'),cookies));assert.equal(cookies.length,0,'temporary upstream failure must preserve cookies');
 mode='ok';const form=new URLSearchParams({email:user.email,password:'synthetic-password'});const signin=await signIn(new Request('https://erp.example.invalid/api/sign-in',{method:'POST',headers:{Origin:'https://erp.example.invalid'},body:form}));assert.equal(signin.status,303);assert.equal(signin.headers.getSetCookie().length,2);
 const out=signOut(new Request('https://erp.example.invalid/api/sign-out',{method:'POST',headers:{Origin:'https://erp.example.invalid'}}));assert.equal(out.status,303);assert.equal(out.headers.getSetCookie().length,2);assert.ok(out.headers.getSetCookie().every(c=>c.endsWith('Max-Age=0')));
 assert.equal(signOut(new Request('https://erp.example.invalid/api/sign-out',{method:'POST',headers:{Origin:'https://elsewhere.example.invalid'}})).status,403);
 console.log('PASS: valid session; expired and missing access-token refresh; secure persistent cookies; concurrent rotation; revoked-session clearing; transient failure preservation; sign-in and explicit sign-out; CSRF.');
}finally{globalThis.fetch=original}
