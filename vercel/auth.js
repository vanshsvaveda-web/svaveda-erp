const cookieName = '__Host-svaveda-session';
const secureHeaders = {'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const cookie = (value, age) => cookieName+'='+value+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+age;

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

export async function identity(request) {
  const token = (request.headers.get('Cookie')||'').split(';').map(value=>value.trim())
    .find(value=>value.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  if (!token) return null;
  const response = await supabaseAuth('user',{headers:{Authorization:'Bearer '+token}});
  if (response.status===401||response.status===403) return null;
  if (!response.ok) throw new Error('Supabase Auth returned an error');
  const user = await response.json();
  return user.id&&user.email&&user.email_confirmed_at?user:null;
}

export function loginPage(failed=false) {
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SvaVeda Workspace · Sign in</title><style>*{box-sizing:border-box}body{background:#f6f2ed;color:#302126;font:15px system-ui;margin:0;min-height:100vh;display:grid;place-items:center;padding:18px}main{background:#fffdf9;border:1px solid #e9ded5;border-radius:18px;padding:28px;width:min(410px,100%)}h1{margin:0 0 20px;font-size:25px}label{display:grid;gap:5px;margin:12px 0}input,button{font:inherit;border-radius:8px;border:1px solid #e9ded5;padding:10px}button{width:100%;background:#702239;color:white;margin-top:5px;cursor:pointer}[role=alert]{color:#702239}</style><main><h1>SvaVeda Workspace</h1>${failed?'<p role="alert">Sign-in failed. Check your account details.</p>':''}<form method="post" action="/api/sign-in"><label>Email<input name="email" type="email" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button>Sign in</button></form></main></html>`,
  {status:failed?401:200,headers:{...secureHeaders,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'"}});
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
  if(!session.user?.email_confirmed_at||!session.access_token)return loginPage(true);
  return new Response(null,{status:303,headers:{...secureHeaders,Location:'/','Set-Cookie':cookie(session.access_token,Math.min(session.expires_in||3600,3600))}});
}

export function signOut(request) {
  if(request.method!=='POST'||request.headers.get('Origin')!==new URL(request.url).origin) return new Response('Forbidden',{status:403,headers:secureHeaders});
  return new Response(null,{status:303,headers:{...secureHeaders,Location:'/','Set-Cookie':cookie('',0)}});
}
