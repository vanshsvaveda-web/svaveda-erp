const cookieName = '__Host-svaveda-session';
const refreshCookieName = '__Host-svaveda-refresh';
const refreshCookieAge = 400 * 24 * 60 * 60;
const refreshes = new Map();
const secureHeaders = {'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const cookie = (name, value, age) => name+'='+value+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+age;
const readCookie = (request,name) => (request.headers.get('Cookie')||'').split(';').map(value=>value.trim()).find(value=>value.startsWith(name+'='))?.slice(name.length+1);
const validUser = user => user?.id&&user.email&&user.email_confirmed_at;
function sessionCookies(session){return [cookie(cookieName,session.access_token,Math.max(1,Math.min(session.expires_in||3600,3600))),cookie(refreshCookieName,session.refresh_token,refreshCookieAge)]}
export function withSessionCookies(response,cookies){
 if(!cookies.length)return response;
 const headers=new Headers(response.headers);for(const value of cookies)headers.append('Set-Cookie',value);
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

function supabaseAuth(path, options = {}) {
  const root = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!root || !key) throw new Error('Supabase Auth is unconfigured');
  return fetch(new URL('/auth/v1/'+path, root), {
    ...options,
    headers: {apikey:key,...options.headers},
    signal: AbortSignal.timeout(10000)
  });
}

async function refreshSession(token){
 if(refreshes.has(token))return refreshes.get(token);
 const pending=(async()=>{
  const response=await supabaseAuth('token?grant_type=refresh_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refresh_token:token})});
  if([400,401,403].includes(response.status))return null;
  if(!response.ok)throw new Error('Supabase session refresh temporarily unavailable');
  const session=await response.json();
  return session.access_token&&session.refresh_token&&validUser(session.user)?session:null;
 })();
 refreshes.set(token,pending);
 try{return await pending}finally{const timer=setTimeout(()=>refreshes.delete(token),5000);timer.unref?.()}
}
export async function identity(request,cookies=[]) {
 const token=readCookie(request,cookieName),refresh=readCookie(request,refreshCookieName);
 if(token){
  const response=await supabaseAuth('user',{headers:{Authorization:'Bearer '+token}});
  if(response.ok){const user=await response.json();return validUser(user)?user:null}
  if(response.status!==401&&response.status!==403)throw new Error('Supabase Auth temporarily unavailable');
 }
 if(!refresh)return null;
 const session=await refreshSession(refresh);
 if(!session){cookies.push(cookie(cookieName,'',0),cookie(refreshCookieName,'',0));return null}
 cookies.push(...sessionCookies(session));return session.user;
}

export function loginPage(failed=false) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#f5f6fa"><meta name="apple-mobile-web-app-capable" content="yes"><title>SvaVeda Workspace · Sign in</title><link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/icons/app-192.png"><link rel="icon" href="/icons/app-192.png"><script src="/appearance.js"></script><link rel="stylesheet" href="/signin.css"></head><body><main><div class="login-brand"><span aria-hidden="true">✦</span><div><h1>SvaVeda</h1><small>Your workspace, wherever you work.</small></div></div><div class="login-controls"><button type="button" data-theme-toggle aria-label="Change theme">◐</button><button type="button" data-install-app>↓ Install app</button></div>${failed?'<p role="alert">Sign-in failed. Check your account details.</p>':''}<form method="post" action="/api/sign-in"><label>Email<input name="email" type="email" autocomplete="username" inputmode="email" autocapitalize="none" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button class="login-submit">Sign in</button></form></main></body></html>`,
  {status:failed?401:200,headers:{...secureHeaders,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; manifest-src 'self'; worker-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"}});
}

export async function signIn(request) {
  if(request.method!=='POST'||request.headers.get('Origin')!==new URL(request.url).origin) return new Response('Forbidden',{status:403,headers:secureHeaders});
  const form=await request.formData();
  const email=form.get('email'),password=form.get('password');
  if(typeof email!=='string'||email.length>254||typeof password!=='string'||password.length>1024) return loginPage(true);
  const response=await supabaseAuth('token?grant_type=password',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email,password})
  });
  if(response.status===429)return new Response('Too many sign-in attempts. Try again shortly.',{status:429,headers:secureHeaders});
  if(!response.ok)return loginPage(true);
  const session=await response.json();
  if(!validUser(session.user)||!session.access_token||!session.refresh_token)return loginPage(true);
  return withSessionCookies(new Response(null,{status:303,headers:{...secureHeaders,Location:'/'}}),sessionCookies(session));
}

export function signOut(request) {
  if(request.method!=='POST'||request.headers.get('Origin')!==new URL(request.url).origin) return new Response('Forbidden',{status:403,headers:secureHeaders});
  return withSessionCookies(new Response(null,{status:303,headers:{...secureHeaders,Location:'/'}}),[cookie(cookieName,'',0),cookie(refreshCookieName,'',0)]);
}
