/* One small procedural ribbon mesh; no model download or rendering dependency. */
(()=>{
 const root=document.documentElement,motion=matchMedia('(prefers-reduced-motion: reduce)'),fine=matchMedia('(hover: hover) and (pointer: fine)');
 let disposeModel=()=>{},lastProgress=new Map();
 const leafSVG=()=>'<svg class="sculpture-fallback" viewBox="0 0 300 220" fill="none" aria-hidden="true"><defs><linearGradient id="leaf-ceramic" x1="65" y1="35" x2="240" y2="190" gradientUnits="userSpaceOnUse"><stop stop-color="var(--sculpture-light)"/><stop offset=".47" stop-color="var(--sculpture-mid)"/><stop offset="1" stop-color="var(--sculpture-dark)"/></linearGradient><linearGradient id="leaf-edge" x1="75" y1="40" x2="230" y2="170"><stop stop-color="var(--metal-light)"/><stop offset="1" stop-color="var(--metal-dark)"/></linearGradient></defs><path d="M57 152C44 68 156 8 244 43C258 132 151 214 57 152Z" fill="url(#leaf-ceramic)"/><path d="M57 152C97 113 145 96 244 43C188 138 134 171 57 152Z" fill="url(#leaf-edge)" opacity=".77"/><path d="M57 152C129 177 207 111 244 43" stroke="var(--metal-light)" stroke-width="2" opacity=".7"/></svg>';
 function ribbonMesh(){
  const at=(u,v)=>{const r=1+v*Math.cos(u/2);return [1.05*r*Math.cos(u),.65*r*Math.sin(u),v*Math.sin(u/2)+.12*Math.cos(u*2)]};
  const vertex=(i,j)=>{const u=i/96*Math.PI*2,v=(j/12-.5)*.65,p=at(u,v),a=at(u+.001,v),b=at(u,v+.001);const du=a.map((x,k)=>x-p[k]),dv=b.map((x,k)=>x-p[k]),n=[du[1]*dv[2]-du[2]*dv[1],du[2]*dv[0]-du[0]*dv[2],du[0]*dv[1]-du[1]*dv[0]],l=Math.hypot(...n);return [...p,...n.map(x=>x/l),j/6-1]};
  const result=[];for(let i=0;i<96;i++)for(let j=0;j<12;j++)for(const [a,b] of [[i,j],[i+1,j],[i,j+1],[i,j+1],[i+1,j],[i+1,j+1]])result.push(...vertex(a,b));return new Float32Array(result);
 }
 function model(host){
  if(!host)return ()=>{};if(!fine.matches||navigator.connection?.saveData){host.dataset.fallbackReason='static-device';return ()=>{}};
  const canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true');canvas.className='signature-canvas';host.append(canvas);
  let gl;try{gl=canvas.getContext('webgl',{alpha:true,antialias:true,powerPreference:'low-power'})}catch{}if(!gl){host.dataset.fallbackReason='webgl-unavailable';canvas.remove();return ()=>{}};
  let stopped=false,frame=0,visible=true,pointer=[0,0],last=0;
  const shaders=[];
  function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s)||'Sculpture shader');shaders.push(s);return s}
  let program,buffer;
  try{
   program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,`attribute vec3 p;attribute vec3 n;attribute float edge;uniform vec3 turn;uniform float aspect;varying vec3 normal;varying vec3 point;varying float band;
   vec3 rotate(vec3 v){float a=turn.x,b=turn.y,c=turn.z;v=vec3(v.x,v.y*cos(a)-v.z*sin(a),v.y*sin(a)+v.z*cos(a));v=vec3(v.x*cos(b)+v.z*sin(b),v.y,-v.x*sin(b)+v.z*cos(b));return vec3(v.x*cos(c)-v.y*sin(c),v.x*sin(c)+v.y*cos(c),v.z);}
   void main(){vec3 v=rotate(p);normal=rotate(n);point=v;band=edge;gl_Position=vec4(v.x/(3.6-v.z)*2.7/aspect,v.y/(3.6-v.z)*2.7,v.z*.1,1.);}`));
   gl.attachShader(program,shader(gl.FRAGMENT_SHADER,`precision mediump float;varying vec3 normal;varying vec3 point;varying float band;uniform vec3 ceramic;uniform vec3 metal;uniform float dark;
   void main(){vec3 n=normalize(normal);if(!gl_FrontFacing)n=-n;vec3 light=normalize(vec3(-.6,.9,1.4)),view=normalize(vec3(0.,0.,4.)-point);float diffuse=max(dot(n,light),0.);float shine=pow(max(dot(n,normalize(light+view)),0.),mix(38.,75.,dark));float rim=pow(1.-abs(dot(n,view)),2.8);float edge=smoothstep(.77,.99,abs(band));vec3 base=mix(ceramic,metal,edge);vec3 color=base*(.43+diffuse*.64)+vec3(1.,.98,.9)*shine*.55+metal*rim*.28;gl_FragColor=vec4(color,1.);}`));
   gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Sculpture link');gl.useProgram(program);const mesh=ribbonMesh();buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,mesh,gl.STATIC_DRAW);
   for(const [name,size,offset] of [['p',3,0],['n',3,12],['edge',1,24]]){const loc=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,28,offset)}
   const uniforms=Object.fromEntries(['turn','aspect','ceramic','metal','dark'].map(name=>[name,gl.getUniformLocation(program,name)]));gl.enable(gl.DEPTH_TEST);gl.clearColor(0,0,0,0);
   function draw(time=0){if(stopped)return;frame=0;if(!visible||document.hidden)return;if(time-last<40&&!motion.matches){frame=requestAnimationFrame(draw);return}last=time;
    const dark=root.dataset.theme==='dark',rect=host.getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,1.5);const width=Math.max(1,Math.round(rect.width*ratio)),height=Math.max(1,Math.round(rect.height*ratio));if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;gl.viewport(0,0,width,height)}
    const phase=motion.matches?0:time*.00018;gl.uniform3f(uniforms.turn,-.65+pointer[1]*.18,.3+pointer[0]*.25+Math.sin(phase)*.15,-.4+Math.cos(phase*.7)*.08);gl.uniform1f(uniforms.aspect,width/height);gl.uniform3fv(uniforms.ceramic,dark?[.26,.34,.29]:[.51,.61,.43]);gl.uniform3fv(uniforms.metal,dark?[.65,.73,.7]:[.76,.64,.41]);gl.uniform1f(uniforms.dark,dark?1:0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.drawArrays(gl.TRIANGLES,0,mesh.length/7);host.dataset.rendered='true';if(!motion.matches)frame=requestAnimationFrame(draw);
   }
   function restart(){cancelAnimationFrame(frame);frame=0;if(!stopped&&visible&&!document.hidden)frame=requestAnimationFrame(draw)}
   const observer=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting;restart()});observer.observe(host);
   const theme=new MutationObserver(restart);theme.observe(root,{attributes:true,attributeFilter:['data-theme']});
   const resize=new ResizeObserver(restart);resize.observe(host);
   const move=event=>{if(motion.matches)return;pointer=[event.clientX/innerWidth-.5,event.clientY/innerHeight-.5]};
   document.addEventListener('pointermove',move,{passive:true});document.addEventListener('visibilitychange',restart);motion.addEventListener('change',restart);restart();
   const lost=event=>{event.preventDefault();host.removeAttribute('data-rendered');host.dataset.fallbackReason='context-lost';stopped=true;cancelAnimationFrame(frame)};canvas.addEventListener('webglcontextlost',lost);
   return ()=>{stopped=true;canvas.removeEventListener('webglcontextlost',lost);cancelAnimationFrame(frame);observer.disconnect();theme.disconnect();resize.disconnect();document.removeEventListener('pointermove',move);document.removeEventListener('visibilitychange',restart);motion.removeEventListener('change',restart);gl.deleteBuffer(buffer);gl.deleteProgram(program);shaders.forEach(s=>gl.deleteShader(s));gl.getExtension('WEBGL_lose_context')?.loseContext()};
  }catch(error){host.dataset.fallbackReason=String(error.message).slice(0,250);if(buffer)gl.deleteBuffer(buffer);if(program)gl.deleteProgram(program);shaders.forEach(s=>gl.deleteShader(s));canvas.remove();return ()=>{}}
 }
 function cleanup(){disposeModel();disposeModel=()=>{}}
 function enhance(container=document){
  cleanup();const hero=container.querySelector('.premium-hero')||document.querySelector('body:has(.login-brand)>main');
  if(hero){const art=document.createElement('div');art.className='signature-sculpture';art.setAttribute('aria-hidden','true');art.innerHTML=leafSVG();hero.append(art);disposeModel=model(art)}
  const ring=container.querySelector('[data-daily-progress]');if(ring){const key=ring.dataset.progressKey,value=Number(ring.dataset.done),previous=lastProgress.get(key);lastProgress.set(key,value);if(previous!==undefined&&value>previous){ring.classList.add('progress-celebrate');if(ring.dataset.done===ring.dataset.total&&value>0)ring.querySelector('.progress-message').textContent='All planned work completed';}}
 }
 document.addEventListener('pointermove',event=>{if(!fine.matches||motion.matches)return;const card=event.target.closest('.project-card');if(!card)return;const r=card.getBoundingClientRect();card.style.setProperty('--card-x',((event.clientY-r.top)/r.height-.5)*-2+'deg');card.style.setProperty('--card-y',((event.clientX-r.left)/r.width-.5)*2+'deg')},{passive:true});
 document.addEventListener('pointerout',event=>{const card=event.target.closest?.('.project-card');if(card&&!card.contains(event.relatedTarget)){card.style.removeProperty('--card-x');card.style.removeProperty('--card-y')}});
 window.SvaVedaVisuals={enhance,cleanup};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{if(document.querySelector('.login-brand'))enhance()});else if(document.querySelector('.login-brand'))enhance();
})();
