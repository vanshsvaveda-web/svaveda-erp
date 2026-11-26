import { isIP } from 'node:net';
import { timingSafeEqual } from 'node:crypto';
import worker from '../dist/server/index.js';
import { database, withSheetWriteLock } from '../vercel/database.js';
import { identity, loginPage, signIn, signOut, withSessionCookies } from '../vercel/auth.js';
import { workspaceMessageDirectory } from '../vercel/message-directory.js';

export default {
  async fetch(request) {
    const original = new URL(request.url);
    const path = original.searchParams.get('route') || original.pathname;
    const url = new URL(original.origin);
    url.pathname = path;
    const sessionCookies=[];
    try {
      if (path === '/api/health' && request.method === 'GET') {
        try {
          await database.prepare('select revision from public.workspace_state limit 1').bind().first();
        } catch (error) {
          const code=String(error.code||'');
          const diagnosis = /^[A-Z0-9_]{2,36}$/.test(code) ? code :
            /tenant|user not found/i.test(error.message)?'POOLER_USER':
            /timeout/i.test(error.message)?'TIMEOUT':
            /auth|password/i.test(error.message)?'AUTH':
            /DATABASE_URL/i.test(error.message)?'CONFIG':'DATABASE_UNAVAILABLE';
          return Response.json({status:'unavailable',diagnosis},{status:503,headers:{'Cache-Control':'no-store'}});
        }
        return Response.json({status:'ready'},{headers:{'Cache-Control':'no-store'}});
      }
      if(path==='/api/sheets/cron'){
        const secret=process.env.CRON_SECRET;
        const expected=Buffer.from('Bearer '+(secret||''));
        const actual=Buffer.from(request.headers.get('Authorization')||'');
        if(request.method!=='GET'||process.env.VERCEL_ENV!=='production'||!secret||actual.length!==expected.length||!timingSafeEqual(actual,expected)){
          return Response.json({error:'Unauthorized'},{status:401,headers:{'Cache-Control':'no-store'}});
        }
        return await withSheetWriteLock(DB=>worker.fetch(new Request(url),{
          DB,GOOGLE_SHEETS_SERVICE_ACCOUNT:process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT,
          SHEET_WRITES_SERIALIZED:true,SHEET_CRON_AUTHORIZED:true
        }));
      }
      if (path === '/api/sign-in') return await signIn(request);
      if (path === '/api/sign-out') return signOut(request);
      const headers = new Headers(request.headers);
      headers.delete('oai-authenticated-user-id');
      headers.delete('oai-authenticated-user-email');
      if(path==='/'||path.startsWith('/api/')){
        const user=await identity(request,sessionCookies);
        if (!user) return withSessionCookies(path==='/'?loginPage():Response.json({error:'Sign in at the workspace home page.'},{status:401,headers:{'Cache-Control':'no-store'}}),sessionCookies);
        headers.set('oai-authenticated-user-id',user.id);
        headers.set('oai-authenticated-user-email',user.email);
      }
      const forwarded = new Request(url, {
        method:request.method,headers,
        ...(request.body?{body:request.body,duplex:'half'}:{})
      });
      const requestIp=request.headers.get('x-vercel-forwarded-for')?.trim();
      const clientIp=process.env.VERCEL==='1'&&requestIp&&isIP(requestIp)?requestIp:null;
      const run=DB=>worker.fetch(forwarded,{DB,MESSAGE_DIRECTORY:access=>workspaceMessageDirectory(access,DB),CLIENT_IP:clientIp,GOOGLE_SHEETS_SERVICE_ACCOUNT:process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT,SHEET_WRITES_SERIALIZED:path==='/api/sheets/process'});
      const response=path==='/api/sheets/process'?await withSheetWriteLock(run):await run(database);
      return withSessionCookies(response,sessionCookies);
    }catch(error){
      console.error('Vercel ERP request failed', error.code || error.name, error.message?.split('\n')[0]?.replace(/postgres(?:ql)?:\/\/\S+/g,'[connection redacted]'));
      return withSessionCookies(new Response('Workspace service unavailable.',{status:503,headers:{'Cache-Control':'no-store'}}),sessionCookies);
    }
  }
};
