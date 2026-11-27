/* Botanical render assets with lightweight depth, sway and accessible motion. */
(()=>{
 const root=document.documentElement,motion=matchMedia('(prefers-reduced-motion: reduce)'),fine=matchMedia('(hover: hover) and (pointer: fine)');
 const lastProgress=new Map();let tiltTarget=null,tiltFrame=0;
 function ambientLeaves(){
  if(document.querySelector('.botanical-background'))return;
  const scene=document.createElement('div');scene.className='botanical-background';scene.setAttribute('aria-hidden','true');
  scene.innerHTML='<span class="ambient-tree ambient-tree-main"><img src="/botanicals/tree-v1.webp" alt="" decoding="async" fetchpriority="low"></span><span class="ambient-tree ambient-tree-far"><img src="/botanicals/tree-v1.webp" alt="" decoding="async" fetchpriority="low"></span><span class="ambient-leaf ambient-leaf-0"></span><span class="ambient-leaf ambient-leaf-2"></span>';
  document.body.prepend(scene);
  const pause=()=>root.toggleAttribute('data-botanical-paused',document.hidden||!!navigator.connection?.saveData);document.addEventListener('visibilitychange',pause);pause();
 }
 function cleanup(){cancelAnimationFrame(tiltFrame);tiltFrame=0;tiltTarget=null}
 function enhance(container=document){
  cleanup();ambientLeaves();const hero=container.querySelector('.premium-hero')||document.querySelector('body:has(.login-brand)>main');
  if(hero){const art=document.createElement('div');art.className='signature-sculpture signature-sunflower';art.setAttribute('aria-hidden','true');art.innerHTML='<div class="flower-parallax"><img class="sunflower-blossom" src="/botanicals/sunflower-v1.webp" alt="" decoding="async" width="1254" height="1254"></div>';hero.append(art);tiltTarget=art.firstElementChild}
  const ring=container.querySelector('[data-daily-progress]');if(ring){const key=ring.dataset.progressKey,value=Number(ring.dataset.done),previous=lastProgress.get(key);lastProgress.set(key,value);if(previous!==undefined&&value>previous){ring.classList.add('progress-celebrate');if(ring.dataset.done===ring.dataset.total&&value>0)ring.querySelector('.progress-message').textContent='All planned work completed';}}
 }
 document.addEventListener('pointermove',event=>{
  if(!fine.matches||motion.matches||navigator.connection?.saveData)return;
  if(tiltTarget&&!tiltFrame){const x=event.clientX/innerWidth-.5,y=event.clientY/innerHeight-.5;tiltFrame=requestAnimationFrame(()=>{tiltFrame=0;if(tiltTarget){tiltTarget.style.setProperty('--flower-rx',y*-9+'deg');tiltTarget.style.setProperty('--flower-ry',x*12+'deg')}})}
  const card=event.target.closest('.project-card');if(!card)return;const r=card.getBoundingClientRect();card.style.setProperty('--card-x',((event.clientY-r.top)/r.height-.5)*-2+'deg');card.style.setProperty('--card-y',((event.clientX-r.left)/r.width-.5)*2+'deg');
 },{passive:true});
 document.addEventListener('pointerout',event=>{const card=event.target.closest?.('.project-card');if(card&&!card.contains(event.relatedTarget)){card.style.removeProperty('--card-x');card.style.removeProperty('--card-y')}});
 window.SvaVedaVisuals={enhance,cleanup};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{if(document.querySelector('.login-brand'))enhance()});else if(document.querySelector('.login-brand'))enhance();
})();
