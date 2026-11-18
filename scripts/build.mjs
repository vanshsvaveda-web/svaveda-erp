import { mkdir, readFile, rm, writeFile, copyFile } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist/server', { recursive: true });
await mkdir('dist/.openai', { recursive: true });
const assets = {};
for (const [path, file, mime] of [
  ['/', 'index.html', 'text/html; charset=utf-8'],
  ['/style.css', 'style.css', 'text/css; charset=utf-8'],
  ['/operations.js', 'operations.js', 'text/javascript; charset=utf-8'],
  ['/calendar.js', 'calendar.js', 'text/javascript; charset=utf-8'],
  ['/messages.js', 'messages.js', 'text/javascript; charset=utf-8'],
  ['/task-metrics.js', 'task-metrics.js', 'text/javascript; charset=utf-8'],
  ['/app.js', 'app.js', 'text/javascript; charset=utf-8'],
]) {
  assets[path] = { mime, body: await readFile('web/' + file, 'utf8') };
}
let worker = (await readFile('worker/index.mjs', 'utf8')) + '\n' + (await readFile('worker/messages.mjs', 'utf8')) + '\n' + (await readFile('worker/roles.mjs', 'utf8')) + '\n' + (await readFile('worker/operations.mjs', 'utf8')) + '\n' + (await readFile('worker/sheets.mjs', 'utf8'));
if (process.env.VERCEL === '1' || process.env.SVAVEDA_VERCEL_BUILD === '1') {
  await mkdir('dist/public', { recursive: true });
  for (const file of ['style.css','app.js','calendar.js','messages.js','operations.js','task-metrics.js']) await copyFile('web/'+file,'dist/public/'+file);
  worker = worker.replace(/const ownerHash = '[a-f0-9]*';/, "const ownerHash = process.env.SVAVEDA_OWNER_EMAIL_HASH || '';");
  assets['/'].body = assets['/'].body.replace('<div class="header-actions">', '<div class="header-actions"><form method="post" action="/api/sign-out"><button>Sign out</button></form>');
}
await writeFile('dist/server/index.js', 'const assets = ' + JSON.stringify(assets) + ';\n' + worker);
await copyFile('.openai/hosting.json', 'dist/.openai/hosting.json');
