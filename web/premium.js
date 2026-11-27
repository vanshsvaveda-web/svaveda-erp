/* Procedural botanical sculpture. No bitmap cutouts, model downloads or animation library. */
(function(scope){
 'use strict';
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const owners=record=>Array.isArray(record.owners)?record.owners:[record.owner];
 function model(tasks=[],leads=[]){
  const done=tasks.filter(t=>t.status==='Done').length;
  const review=tasks.filter(t=>t.status==='In review').length;
  const active=tasks.filter(t=>['In progress','Rework'].includes(t.status)).length;
  const verified=leads.filter(l=>l.status==='Verified').length;
  const onboarded=leads.filter(l=>['Onboarded','Program listed'].includes(l.status)).length;
  const contacted=leads.filter(l=>['Contacted','Follow-up','Interested','Registered','Verified','Program listed','Onboarded'].includes(l.status)).length;
  const full=(tasks.length>0||leads.length>0)&&done===tasks.length&&onboarded===leads.length;
  const stage=full?5:done||onboarded?4:review||verified?3:active||contacted?2:tasks.length||leads.length?1:0;
  return {stage,done,review,active,total:tasks.length,experts:leads.length,verified,onboarded,contacted,full,
   branches:stage>=2?6:stage===1?4:0,
   // Sampled botanical clusters. Exact workload counts remain in the caption and task list.
   flowers:full?7:Math.min(6,done+onboarded),buds:Math.min(5,review+verified),
   leaves:stage>=2?12:stage===1?5:2,
   label:['Ready to grow','Work planned','Growing','Ready for review','In bloom','Full bloom'][stage]};
 }
 function project(state,record){
  const tasks=(state.tasks||[]).filter(t=>t.projectId===record.id);
  const ids=new Set(tasks.map(t=>t.lead).filter(Boolean));
  const onboarding=record.id==='expert-onboarding'||record.name?.trim().toLowerCase()==='expert onboarding';
  const leads=(state.leads||[]).filter(l=>ids.has(l.id)||l.projectId===record.id||(onboarding&&!l.projectId));
  return model(tasks,leads);
 }
 function personal(state,name,today){
  const tasks=(state.tasks||[]).filter(t=>owners(t).includes(name)&&
   (t.status!=='Done'?(!t.due||t.due<=today):t.completedAt?
    new Date(Number(t.completedAt)+330*60000).toISOString().slice(0,10)===today:t.due===today));
  return model(tasks);
 }

 function areaFor(record={}){
  const value=String(record.department||record.name||'').toLowerCase();
  return /expert|acquisition|lead|sales/.test(value)?'Sales':/market|content|social|campaign|launch/.test(value)?'Marketing':/team|people|human resources|^hr$/.test(value)?'Team':'Operations';
 }
 function company(state={}){
  const projects=new Map((state.projects||[]).map(p=>[p.id,p])),tasks=state.tasks||[],leads=state.leads||[];
  return {...model(tasks,leads),areas:['Operations','Marketing','Sales','Team'].map(name=>({name,...model(tasks.filter(t=>(t.lead?'Sales':areaFor(t.department?t:projects.get(t.projectId)||{}))===name),name==='Sales'?leads:[])}))};
 }
 function companyMarkup(state){
  const m=company(state),key='company-garden-'+(++serial);
  const leaf=(x,y,r)=>'<g transform="translate('+x+' '+y+') rotate('+r+')"><path d="M0 0C-7-25 14-42 39-39C42-14 21 3 0 0Z" fill="url(#'+key+'-leaf)"/><path d="M0 0Q23-1 39-39Q21-9 0 0" fill="var(--garden-leaf-dark)" opacity=".28"/><path d="M2-2 32-32" stroke="var(--garden-vein)" stroke-width="1" opacity=".55"/></g>';
  const flower=(x,y,bud)=>'<g transform="translate('+x+' '+y+')"><g class="'+(bud?'growth-bud':'growth-flower')+'">'+(bud?'<path d="M-6 2Q-13-13 0-20Q13-13 6 2Z" fill="url(#'+key+'-gold)"/><path d="M-7 1 0-4 7 1 0 7Z" fill="var(--garden-leaf-dark)"/>':Array.from({length:7},(_,i)=>'<ellipse cx="0" cy="-8" rx="5" ry="9" fill="url(#'+key+'-gold)" transform="rotate('+i*360/7+')"/>').join('')+'<circle r="5" fill="#73532d"/><circle cx="-1" cy="-1" r="2" fill="#bc9251"/>')+'</g></g>';
  const branches=[{x:85,y:166,p:'M230 245Q178 245 131 210Q102 193 85 166',r:-20},{x:154,y:70,p:'M231 197Q174 168 161 120Q151 94 154 70',r:-12},{x:304,y:58,p:'M232 172Q275 152 292 108Q302 81 304 58',r:12},{x:377,y:160,p:'M231 233Q288 225 333 193Q360 178 377 160',r:20}];
  const crown=branches.map((b,i)=>{
   const a=m.areas[i],flowers=Math.min(2,a.done+a.onboarded),buds=Math.min(2,a.review+a.verified),points=[[b.x-22,b.y-19],[b.x+31,b.y-20],[b.x+1,b.y-39],[b.x-44,b.y+29]];
   const foliage=leaf(b.x,b.y+10,b.r-95)+leaf(b.x+5,b.y+6,b.r+5)+(a.total||a.experts?leaf(b.x-23,b.y+38,b.r-130)+leaf(b.x+24,b.y+35,b.r+20):'')+(a.active||a.contacted||a.done||a.review?leaf(b.x-36,b.y+3,b.r-112)+leaf(b.x+34,b.y+4,b.r):'')+(a.active>1||a.done>1?leaf(b.x-12,b.y-23,b.r-100)+leaf(b.x+12,b.y-27,b.r):'');
   return '<g class="company-branch" data-area="'+a.name+'"><title>'+escape(a.name+': '+label(a))+'</title><path d="'+b.p+'" stroke="url(#'+key+'-wood)" stroke-width="9" stroke-linecap="round"/><path d="'+b.p+'" stroke="var(--garden-vein)" stroke-width="1.3" opacity=".16" stroke-linecap="round"/>'+foliage+points.slice(0,flowers).map(p=>flower(...p,false)).join('')+points.slice(flowers,flowers+buds).map(p=>flower(...p,true)).join('')+'</g>';
  }).join('');
  const art='<svg class="growth-sculpture company-tree" viewBox="0 0 460 320" fill="none" aria-hidden="true"><defs><linearGradient id="'+key+'-wood" x1="208" y1="50" x2="245" y2="296" gradientUnits="userSpaceOnUse"><stop stop-color="var(--garden-wood-light)"/><stop offset=".5" stop-color="var(--garden-wood)"/><stop offset="1" stop-color="var(--garden-wood-dark)"/></linearGradient><linearGradient id="'+key+'-leaf" x1="0" y1="0" x2="1" y2="1"><stop stop-color="var(--garden-leaf-light)"/><stop offset=".45" stop-color="var(--garden-leaf)"/><stop offset="1" stop-color="var(--garden-leaf-dark)"/></linearGradient><radialGradient id="'+key+'-gold" cx=".3" cy=".2" r=".85"><stop stop-color="#fff0a3"/><stop offset=".55" stop-color="#f3c64a"/><stop offset="1" stop-color="#d59828"/></radialGradient></defs><ellipse cx="231" cy="302" rx="112" ry="11" fill="var(--garden-shadow)" opacity=".09"/><ellipse cx="231" cy="302" rx="69" ry="5" fill="var(--garden-shadow)" opacity=".07"/><g class="growth-canopy"><path d="M230 293Q234 247 230 199Q225 134 234 94" stroke="url(#'+key+'-wood)" stroke-width="15" stroke-linecap="round"/><path d="M227 290Q231 246 227 199" stroke="var(--garden-vein)" stroke-width="2" opacity=".18" stroke-linecap="round"/>'+crown+'<path d="M230 291Q214 301 196 301M233 291Q247 299 266 302" stroke="var(--garden-wood-dark)" stroke-width="5" stroke-linecap="round"/></g></svg>';
  return '<button type="button" class="company-growth" data-act="ops-project" aria-label="'+escape('Open project garden. Company growth: '+label(m)+'. Branches: '+m.areas.map(a=>a.name+', '+a.total+' tasks').join('; '))+'" title="Open project garden"><span class="company-growth-art" aria-hidden="true"><span class="company-leaf-haze"></span><span class="growth-depth">'+art+'</span></span><span class="company-area-legend" aria-hidden="true">'+m.areas.map(a=>'<span data-area="'+a.name+'"><i></i>'+a.name+'</span>').join('')+'</span><span class="company-growth-caption">'+m.done+' of '+m.total+' tasks complete'+(m.review?' · '+m.review+' in review':'')+'</span></button>';
 }

 const label=m=>m.total+' tasks · '+m.done+' complete · '+m.review+' in review'+(m.experts?' · '+m.onboarded+' of '+m.experts+' experts onboarded · '+m.verified+' verified':'');
 let serial=0;
 function sculpture(m,kind='tree'){
  const key='garden-'+(++serial),branch=kind==='branch'||kind==='login';
  const leaf=(x,y,r,i)=>'<g class="growth-leaf" transform="translate('+x+' '+y+') rotate('+r+')"><path d="M0 0C-8-24 12-43 38-40C42-15 22 2 0 0Z" fill="url(#'+key+'-leaf)"/><path d="M0 0 32-34" stroke="var(--garden-vein)" stroke-width="1" opacity=".65"/></g>';
  const flower=(x,y,n,bud=false)=>'<g transform="translate('+x+' '+y+')"><g class="'+(bud?'growth-bud':'growth-flower')+'">'+(bud?'<path d="M-8 2Q-15-14 0-22Q15-14 8 2Z" fill="url(#'+key+'-gold)"/><path d="M-9 1Q0-7 9 1Q0 11-9 1" fill="var(--garden-leaf-dark)"/>':Array.from({length:7},(_,i)=>'<ellipse cx="0" cy="-9" rx="5.5" ry="10" fill="url(#'+key+'-gold)" transform="rotate('+i*360/7+')"/>').join('')+'<circle r="5.5" fill="#684b2b"/><circle cx="-1" cy="-1.5" r="2" fill="#b9904f"/>')+'</g></g>';
  const positions=[[98,171,-112],[181,174,-4],[85,128,-122],[205,126,2],[121,83,-105],[173,72,-6],[63,170,-128],[224,162,3],[105,215,-120],[194,209,7],[146,128,-94],[150,44,-3]];
  const tips=[[68,126],[224,115],[119,64],[185,60],[62,184],[236,180],[151,34]];
  const stems=['M151 280Q146 210 150 144Q149 77 157 39','M149 207Q104 199 72 164','M150 173Q195 162 223 126','M150 145Q106 131 80 101','M151 116Q183 100 190 64','M148 235Q197 223 225 191','M150 85Q127 74 120 51'];
  const branchCount=kind==='login'?6:m.branches;
  const leafPositions=kind!=='login'&&m.stage===0?[[151,215,-110],[153,190,-5]]:positions;
  const branchPaths=kind!=='login'&&m.stage===0?['M151 280Q145 230 153 188']:stems.slice(0,1+branchCount);
  const core=branchPaths.map((d,i)=>'<path d="'+d+'" fill="none" stroke="url(#'+key+'-wood)" stroke-width="'+(i?Math.max(3,8-i):12)+'" stroke-linecap="round"/>').join('');
  let leaves=leafPositions.slice(0,kind==='login'?12:m.leaves).map((p,i)=>leaf(...p,i)).join('');
  let blossoms='';
  if(kind==='login'){
   blossoms=flower(185,60,0)+flower(68,126,1,true)+flower(224,115,2,true);
  }else{
   blossoms=tips.slice(0,m.flowers).map((p,i)=>flower(...p,i)).join('');
   blossoms+=tips.slice(m.flowers,m.flowers+m.buds).map((p,i)=>flower(...p,i,true)).join('');
  }
  return '<svg class="growth-sculpture '+(branch?'growth-branch':'growth-tree')+'" viewBox="0 0 300 320" fill="none" aria-hidden="true"><defs>'+
   '<linearGradient id="'+key+'-wood" x1="125" y1="50" x2="170" y2="280" gradientUnits="userSpaceOnUse"><stop stop-color="var(--garden-wood-light)"/><stop offset=".45" stop-color="var(--garden-wood)"/><stop offset="1" stop-color="var(--garden-wood-dark)"/></linearGradient>'+
   '<linearGradient id="'+key+'-leaf" x1="0" y1="-40" x2="30" y2="5" gradientUnits="userSpaceOnUse"><stop stop-color="var(--garden-leaf-light)"/><stop offset=".48" stop-color="var(--garden-leaf)"/><stop offset="1" stop-color="var(--garden-leaf-dark)"/></linearGradient>'+
   '<radialGradient id="'+key+'-gold" cx=".3" cy=".2" r=".85"><stop stop-color="#fff1a3"/><stop offset=".5" stop-color="#f7cc43"/><stop offset="1" stop-color="#d99a22"/></radialGradient>'+
   '<radialGradient id="'+key+'-dew" cx=".3" cy=".25" r=".8"><stop stop-color="#fff" stop-opacity=".85"/><stop offset=".4" stop-color="#d8e7df" stop-opacity=".18"/><stop offset="1" stop-color="#a5c5b5" stop-opacity=".65"/></radialGradient></defs>'+
   '<ellipse cx="153" cy="293" rx="67" ry="9" fill="var(--garden-shadow)" opacity=".12"/>'+
   '<g class="growth-canopy">'+core+leaves+blossoms+
   (kind==='login'?'<path class="garden-dew" d="M218 164C220 173 231 179 228 187C224 198 209 192 211 184C212 178 218 172 218 164Z" fill="url(#'+key+'-dew)" stroke="var(--garden-vein)" stroke-opacity=".45"/><path d="M215 184Q212 187 216 189" stroke="#fff" stroke-opacity=".8" stroke-linecap="round"/>':'')+'</g>'+
   (branch?'':'<path d="M147 278Q139 288 119 290M154 279Q165 289 185 290" stroke="var(--garden-wood-dark)" stroke-width="5" stroke-linecap="round"/>')+'</svg>';
 }
 function markup(m,{kind='tree',caption=true,title=''}={}){
  return '<figure class="growth-scene growth-'+kind+'-scene" data-growth-stage="'+m.stage+'"><div class="growth-depth">'+sculpture(m,kind)+'</div>'+
   (caption?'<figcaption><strong>'+escape(title||m.label)+'</strong><span>'+escape(label(m))+'</span></figcaption>':'')+'</figure>';
 }
 function loginPending(storage,failed=false){
  try{if(failed)storage.removeItem('svaveda-garden-entry');else storage.setItem('svaveda-garden-entry',String(Date.now()))}catch{}
 }
 function consumeWelcome(storage,authenticated){
  if(!authenticated)return false;
  try{const stamp=Number(storage.getItem('svaveda-garden-entry'));storage.removeItem('svaveda-garden-entry');return stamp>0&&Date.now()-stamp>=0&&Date.now()-stamp<120000}catch{return false}
 }
 scope.SvaVedaGrowth={model,project,personal,company,companyMarkup,markup,label,loginPending,consumeWelcome};
 if(typeof document==='undefined')return;
 const root=document.documentElement,motion=matchMedia('(prefers-reduced-motion: reduce)'),fine=matchMedia('(hover: hover) and (pointer: fine)');
 const lastProgress=new Map();let tiltTarget=null,frame=0;
 function ambient(){
  if(document.querySelector('.botanical-background'))return;
  const scene=document.createElement('div');scene.className='botanical-background';scene.setAttribute('aria-hidden','true');
  scene.innerHTML='<div class="garden-shadow-branch">'+sculpture(model([{status:'In progress'}]))+'</div><span class="ambient-leaf ambient-leaf-0"></span><span class="ambient-leaf ambient-leaf-2"></span>';
  document.body.prepend(scene);
  const pause=()=>root.toggleAttribute('data-botanical-paused',document.hidden||!!navigator.connection?.saveData);
  document.addEventListener('visibilitychange',pause);pause();
 }
 function cleanup(){cancelAnimationFrame(frame);frame=0;tiltTarget=null}
 function sessionStore(){try{return sessionStorage}catch{return null}}
 function welcome(context,hero){
  if(!context?.authenticated||!consumeWelcome(sessionStore(),true))return;
  const note=document.createElement('div');note.className='garden-welcome';note.setAttribute('role','status');note.textContent='Welcome to your workspace.';
  note.innerHTML=markup({...model([{status:'In review'}]),flowers:1,buds:0},{kind:'branch',caption:false})+'<span>Welcome to your workspace.</span>';
  document.body.append(note);
  if(hero)hero.classList.add('garden-arrival');
  setTimeout(()=>{note.remove();hero?.classList.remove('garden-arrival')},1800);
 }
 function enhance(container=document,context){
  cleanup();ambient();
  const login=document.querySelector('.login-brand');
  if(login){
   const main=login.closest('main'),scene=document.querySelector('.login-garden');
   if(scene&&!scene.querySelector('.growth-scene'))scene.insertAdjacentHTML('afterbegin',markup(model([{status:'In progress'}]),{kind:'login',caption:false}));
   tiltTarget=scene?.querySelector('.growth-depth');
   if(!main.dataset.gardenBound){main.dataset.gardenBound='true';if(main.querySelector('[role="alert"]'))loginPending(sessionStore(),true);
    main.querySelector('form')?.addEventListener('submit',()=>loginPending(sessionStore()));}
   return;
  }
  const hero=container.querySelector('.premium-hero');
  if(hero&&context){
   const personalView=hero.classList.contains('personal-heading');
   if(personalView){hero.querySelector('.hero-growth')?.remove();const art=document.createElement('div');art.className='hero-growth';
    art.innerHTML=markup(personal(context.data,context.name,context.today),{kind:'branch',caption:false});art.setAttribute('aria-hidden','true');hero.append(art);tiltTarget=art.querySelector('.growth-depth');}
   else{hero.classList.add('garden-overview-hero');hero.querySelector('.company-growth')?.remove();hero.insertAdjacentHTML('beforeend',companyMarkup(context.data));tiltTarget=hero.querySelector('.company-growth .growth-depth');}
  }
  const ring=container.querySelector('[data-daily-progress]');
  if(ring){const key=ring.dataset.progressKey,value=Number(ring.dataset.done),previous=lastProgress.get(key);lastProgress.set(key,value);
   if(previous!==undefined&&value>previous){ring.classList.add('progress-celebrate');if(ring.dataset.done===ring.dataset.total&&value>0)ring.querySelector('.progress-message').textContent='All planned work completed';}}
  welcome(context,hero);
 }
 document.addEventListener('pointermove',event=>{
  if(!fine.matches||motion.matches||navigator.connection?.saveData)return;
  if(tiltTarget&&!frame){const x=event.clientX/innerWidth-.5,y=event.clientY/innerHeight-.5;
   frame=requestAnimationFrame(()=>{frame=0;if(tiltTarget){tiltTarget.style.setProperty('--garden-rx',y*-7+'deg');tiltTarget.style.setProperty('--garden-ry',x*10+'deg')}})}
  const card=event.target.closest?.('.project-card');if(!card)return;const r=card.getBoundingClientRect();
  card.style.setProperty('--card-x',((event.clientY-r.top)/r.height-.5)*-2+'deg');card.style.setProperty('--card-y',((event.clientX-r.left)/r.width-.5)*2+'deg');
 },{passive:true});
 document.addEventListener('pointerout',event=>{const card=event.target.closest?.('.project-card');if(card&&!card.contains(event.relatedTarget)){card.style.removeProperty('--card-x');card.style.removeProperty('--card-y')}});
 scope.SvaVedaVisuals={enhance,cleanup};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{if(document.querySelector('.login-brand'))enhance()});else if(document.querySelector('.login-brand'))enhance();
})(globalThis);
