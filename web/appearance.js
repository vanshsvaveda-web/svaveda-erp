/* Device theme and installation work on both the sign-in and workspace screens. */
(()=>{
 const preferenceKey='svaveda-theme',root=document.documentElement,system=matchMedia('(prefers-color-scheme: dark)');
 let preference='system',installPrompt;
 try{const saved=localStorage.getItem(preferenceKey);if(['system','light','dark'].includes(saved))preference=saved}catch{}
 const installed=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 function apply(){
  const dark=preference==='dark'||preference==='system'&&system.matches;
  root.dataset.theme=dark?'dark':'light';root.style.colorScheme=dark?'dark':'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark?'#10151f':'#f5f6fa');
  document.querySelectorAll('[data-theme-toggle]').forEach(button=>{
   const label=preference==='system'?'System':dark?'Dark':'Light';
   button.innerHTML=(preference==='system'?'◐':dark?'☾':'☀')+'<span class="appearance-label">'+label+'</span>';
   button.setAttribute('aria-label','Theme: '+label+'. Change theme');button.title='Theme: '+label+' · tap to change';
  });
 }
 apply();system.addEventListener('change',apply);
 addEventListener('storage',event=>{if(event.key===preferenceKey){preference=['system','light','dark'].includes(event.newValue)?event.newValue:'system';apply()}});
 function help(){
  let dialog=document.getElementById('install-help');
  if(!dialog){dialog=document.createElement('dialog');dialog.id='install-help';dialog.setAttribute('aria-labelledby','install-help-title');document.body.append(dialog);}
  dialog.innerHTML='<h2 id="install-help-title">Install SvaVeda</h2><p>In Chrome, open the ⋮ menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>. On iPhone, use the browser’s Share menu, then <strong>Add to Home Screen</strong>.</p><p>The app opens in its own window. Connect to the internet to sign in, save work and sync.</p><button type="button" id="close-install-help">Got it</button>';
  dialog.querySelector('button').onclick=()=>dialog.close();dialog.showModal();
 }
 function updateInstall(){document.querySelectorAll('[data-install-app]').forEach(button=>{button.hidden=installed();button.title=installPrompt?'Install SvaVeda app':'How to install SvaVeda'})}
 addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;updateInstall()});
 addEventListener('appinstalled',()=>{installPrompt=null;updateInstall()});
 document.addEventListener('click',async event=>{
  if(event.target.closest('[data-theme-toggle]')){preference=({system:'dark',dark:'light',light:'system'})[preference];try{localStorage.setItem(preferenceKey,preference)}catch{}apply();}
  if(event.target.closest('[data-install-app]')){
   if(!installPrompt){help();return}
   const prompt=installPrompt;installPrompt=null;try{await prompt.prompt();await prompt.userChoice}catch{help()}updateInstall();
  }
 });
 function ready(){
  apply();updateInstall();
  const banner=document.getElementById('connection-status');
  const connectivity=()=>{if(banner){banner.hidden=navigator.onLine;banner.textContent='You’re offline. Reconnect before saving or syncing.'}};
  addEventListener('online',connectivity);addEventListener('offline',connectivity);connectivity();
  if('serviceWorker' in navigator&&isSecureContext)navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).catch(()=>{});
  if(window.visualViewport){const resize=()=>{root.style.setProperty('--visible-height',Math.round(visualViewport.height)+'px');document.body.classList.toggle('keyboard-open',innerHeight-visualViewport.height>150&&/INPUT|TEXTAREA/.test(document.activeElement?.tagName||''))};visualViewport.addEventListener('resize',resize);document.addEventListener('focusout',()=>document.body.classList.remove('keyboard-open'));resize();}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready);else ready();
})();
