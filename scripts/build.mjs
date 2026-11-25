import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile, copyFile } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist/server', { recursive: true });
await mkdir('dist/.openai', { recursive: true });
const assets = {};
for (const [path, file, mime] of [
  ['/', 'index.html', 'text/html; charset=utf-8'],
  ['/style.css', 'style.css', 'text/css; charset=utf-8'],
  ['/modern.css', 'modern.css', 'text/css; charset=utf-8'],
  ['/operations.js', 'operations.js', 'text/javascript; charset=utf-8'],
  ['/calendar.js', 'calendar.js', 'text/javascript; charset=utf-8'],
  ['/messages.js', 'messages.js', 'text/javascript; charset=utf-8'],
  ['/message-links.js', 'message-links.js', 'text/javascript; charset=utf-8'],
  ['/lead-history.js', 'lead-history.js', 'text/javascript; charset=utf-8'],
  ['/assignees.js', 'assignees.js', 'text/javascript; charset=utf-8'],
  ['/task-metrics.js', 'task-metrics.js', 'text/javascript; charset=utf-8'],
  ['/app.js', 'app.js', 'text/javascript; charset=utf-8'],
]) {
  assets[path] = { mime, body: await readFile('web/' + file, 'utf8') };
}
let worker = (await readFile('worker/index.mjs', 'utf8')) + '\n' + (await readFile('worker/messages.mjs', 'utf8')) + '\n' + (await readFile('web/message-links.js', 'utf8')) + '\n' + (await readFile('worker/roles.mjs', 'utf8')) + '\n' + (await readFile('worker/operations.mjs', 'utf8')) + '\n' + (await readFile('worker/sheets.mjs', 'utf8')) + '\n' + (await readFile('web/assignees.js', 'utf8')) + '\n' + (await readFile('web/lead-history.js', 'utf8'));
if (process.env.VERCEL === '1' || process.env.SVAVEDA_VERCEL_BUILD === '1') {
  await mkdir('dist/public', { recursive: true });
  for (const file of ['style.css','modern.css','app.js','calendar.js','messages.js','message-links.js','operations.js','task-metrics.js','assignees.js','lead-history.js']) await copyFile('web/'+file,'dist/public/'+file);
  worker = worker.replace(/const ownerHash = '[a-f0-9]*';/, "const ownerHash = process.env.SVAVEDA_OWNER_EMAIL_HASH || '';");
  assets['/'].body = assets['/'].body.replace('<div class="header-actions">', '<div class="header-actions"><form method="post" action="/api/sign-out"><button>Sign out</button></form>');
}
if (process.env.VERCEL === '1' || process.env.SVAVEDA_VERCEL_BUILD === '1') {
  const version=createHash('sha256').update(JSON.stringify(assets)).digest('hex').slice(0,12);
  for(const [path,asset] of Object.entries(assets)){
    if(path==='/')continue;
    const extension=path.lastIndexOf('.');
    const hashed=path.slice(0,extension)+'.'+version+path.slice(extension);
    await writeFile('dist/public'+hashed,asset.body);
    assets['/'].body=assets['/'].body.replaceAll(path,hashed);
  }
}
await writeFile('dist/server/index.js', 'const assets = ' + JSON.stringify(assets) + ';\n' + worker);
await copyFile('.openai/hosting.json', 'dist/.openai/hosting.json');
