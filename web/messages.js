let inbox, thread, messageBusy=false, inboxLoading=false, inboxError='', pendingSend;
const threadMessages=person=>inbox.messages.filter(message=>message.sender===inbox.user&&message.recipient===person||message.recipient===inbox.user&&message.sender===person);
function chatPreferences(){
 try{return JSON.parse(localStorage.getItem('svaveda-chat-'+inbox.user))||{pins:[],read:{}}}catch{return {pins:[],read:{}}}
}
function writeChatPreferences(value){try{localStorage.setItem('svaveda-chat-'+inbox.user,JSON.stringify(value))}catch{}}
const initials=name=>name.split(/\s+/).slice(0,2).map(word=>word[0]).join('').toUpperCase();
const messageDate=stamp=>new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium'}).format(stamp);
const messageTime=stamp=>new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',timeStyle:'short'}).format(stamp);
async function messageRequest(path='',payload){
 const response=await fetch('/api/messages'+path,payload?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}:{});
 const result=await response.json();
 if(!response.ok)throw Error(result.error||'Messages are temporarily unavailable.');
 return result;
}
async function refreshMessages({paint=true}={}){
 if(inboxLoading)return;
 inboxLoading=true;
 try{
  inbox=await messageRequest();
  thread||=inbox.user;
  inboxError='';
 }catch(error){
  inboxError=error.message;
 }finally{
  inboxLoading=false;
  if(paint&&page==='Messages')renderMessages(false);
 }
}
function renderMessages(loadIfEmpty=true){
 const heading=title('Messages','Direct conversations and saved notes.',btn('Refresh','msg-refresh')+btn('New message','msg-new','',true));
 if(!inbox){
  ui.innerHTML=heading+panel('Inbox',empty(inboxError?e(inboxError):'Opening messages…'));
  if(loadIfEmpty&&!inboxError)refreshMessages();
  return;
 }
 const contacts=[{id:inbox.user,name:'Saved notes'},...inbox.directory];
 if(data.messages.length)contacts.push({id:'previous-drafts',name:'Previous drafts'});
 const contact=contacts.find(person=>person.id===thread)||contacts[0];
 thread=contact.id;
 const records=threadMessages(thread), preferences=chatPreferences();
 const incoming=records.filter(message=>message.recipient===inbox.user&&message.sender!==inbox.user);
 if(incoming.length){preferences.read[thread]=incoming.at(-1).created;writeChatPreferences(preferences)}
 const threads=new Map(contacts.map(person=>[person.id,threadMessages(person.id)]));
 contacts.sort((a,b)=>Number(preferences.pins.includes(b.id))-Number(preferences.pins.includes(a.id))||
 (threads.get(b.id).at(-1)?.created||0)-(threads.get(a.id).at(-1)?.created||0));
 const contactRows=contacts.map(person=>{
  const messages=threads.get(person.id), latest=messages.at(-1);
  const unread=messages.filter(message=>message.recipient===inbox.user&&message.sender!==inbox.user&&message.created>(preferences.read[person.id]||0)).length;
  const preview=latest?(latest.body||latest.file||'Attachment'):person.id===inbox.user?'Private to you':person.id==='previous-drafts'?'Archived':'Direct message';
  return `<button class="chat-contact" aria-current="${person.id===thread}" data-act="msg-thread" data-key="${e(person.id)}" data-name="${e(person.name.toLowerCase())}"><span class="avatar">${e(initials(person.name))}</span><span class="chat-contact-label"><strong>${e(person.name)}${preferences.pins.includes(person.id)?' · Pinned':''}</strong><small>${e(preview)}</small></span>${unread?`<span class="unread-count" aria-label="${unread} unread">${unread}</span>`:''}</button>`;
 }).join('');
 let previousDate='';
 const bubbles=records.map(message=>{
  const date=messageDate(message.created), divider=date===previousDate?'':`<div class="message-day"><span>${e(date)}</span></div>`;
  previousDate=date;
  return divider+`<article class="bubble ${message.sender===inbox.user?'outgoing':''}">${message.body?`<div class="bubble-text">${e(message.body)}</div>`:''}${message.file?`<a class="message-file" href="/api/messages/files/${encodeURIComponent(message.id)}" download>↓ ${e(message.file)}</a>`:''}<time datetime="${new Date(message.created).toISOString()}">${e(messageTime(message.created))}</time></article>`;
 }).join('');
 const drafts=thread==='previous-drafts';
 const history=drafts?data.messages.map(message=>`<article class="bubble"><strong>To ${e(message.owner)}</strong><div class="bubble-text">${e(message.note)}</div>${message.file?.url?.startsWith('data:')?download(message.file):''}</article>`).join(''):bubbles||`<div class="chat-empty"><strong>${thread===inbox.user?'Keep a note for yourself':'Start the conversation'}</strong><p>${thread===inbox.user?'Files and notes saved here are visible only to you.':'Write a message or attach a file below.'}</p></div>`;
 ui.innerHTML=heading+`<div class="panel chat"><div class="chat-sidebar"><div class="chat-list-head"><strong>Conversations</strong><input id="chat-search" type="search" placeholder="Search people" aria-label="Search conversations"></div><div id="chat-contacts">${contactRows}</div></div><div class="chat-main"><div class="chat-head"><span class="avatar">${e(initials(contact.name))}</span><div><strong>${e(contact.name)}</strong><small>${drafts?'Drafts from the previous workspace':thread===inbox.user?'Private to you':'Direct message'}</small></div>${drafts?'':btn(preferences.pins.includes(thread)?'Unpin':'Pin','msg-pin',thread)}</div><div id="chat-history" class="chat-history" role="log" aria-label="Conversation history">${history}</div>${drafts?'':`<form class="composer" id="compose-message"><div class="compose-input"><textarea name="body" maxlength="5000" rows="2" aria-label="Message text" placeholder="${thread===inbox.user?'Write a note…':'Write a message…'}"></textarea><div class="compose-actions"><label class="file-picker"><span id="attachment-label">＋ Attach file</span><input type="file" name="attachment" aria-label="Attach file"></label><button type="submit" class="primary">${thread===inbox.user?'Save note':'Send'}</button></div></div><div id="message-error" role="alert">${e(inboxError)}</div></form>`}</div></div>`;
 $('#chat-search').oninput=event=>{
  const term=event.target.value.trim().toLowerCase();
  $('#chat-contacts').querySelectorAll('button').forEach(button=>{button.hidden=!button.dataset.name.includes(term)});
 };
 const historyBox=$('#chat-history');
 historyBox.scrollTop=historyBox.scrollHeight;
 if(!drafts){
  const composer=$('#compose-message');
  composer.elements.attachment.onchange=event=>{$('#attachment-label').textContent=event.target.files[0]?.name||'＋ Attach file'};
  composer.elements.body.onkeydown=event=>{
   if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();composer.requestSubmit()}
  };
  composer.onsubmit=sendMessage;
 }
}
async function sendMessage(event){
 event.preventDefault();
 if(messageBusy)return;
 const form=event.currentTarget;
 const errorBox=$('#message-error');
 const value=new FormData(form);
 const recipient=thread;
 const body=value.get('body').trim();
 const selectedFile=value.get('attachment');
 const send=form.querySelector('button[type="submit"]');
 messageBusy=true;
 send.disabled=true;
 errorBox.textContent='';
 try{
  const attachment=await attach(selectedFile);
  if(!body&&!attachment)throw Error('Write a message or attach a file.');
  const file=attachment?{name:attachment.name,data:attachment.url.split(',')[1]}:null;
  const signature=JSON.stringify({recipient,body,file});
  if(pendingSend?.signature!==signature)pendingSend={signature,id:id()};
  await messageRequest('',{id:pendingSend.id,recipient,body,file});
  pendingSend=null;
  await refreshMessages();
  if(inboxError&&page==='Messages')notify('Saved. Refresh to see the latest messages.');
 }catch(error){
  if(form.isConnected)errorBox.textContent=error.message;
 }finally{
  messageBusy=false;
  send.disabled=false;
 }
}
function messageAction(act,key){
 if(messageBusy)return;
 if(act==='msg-refresh'){refreshMessages();return}
 if(act==='msg-pin'&&inbox){const preferences=chatPreferences();preferences.pins=preferences.pins.includes(key)?preferences.pins.filter(id=>id!==key):[...preferences.pins,key];writeChatPreferences(preferences);renderMessages();return}
 if(act==='msg-thread'){thread=key;renderMessages();return}
 if(act!=='msg-new')return;
 if(!inbox){refreshMessages();return}
 const contacts=[{id:inbox.user,name:'Saved notes'},...inbox.directory];
 modal.innerHTML=`<h2>New message</h2><div class="message-picker">${contacts.map(person=>`<button data-person="${e(person.id)}">${e(person.name)}</button>`).join('')}</div><p>Team members appear after they have Site access and join the directory.</p><button id="join-messages">Join directory</button> <button id="close-message-picker">Close</button>`;
 modal.querySelectorAll('[data-person]').forEach(button=>button.onclick=()=>{
  thread=button.dataset.person;modal.close();renderMessages();$('#compose-message textarea')?.focus();
 });
 $('#close-message-picker').onclick=()=>modal.close();
 $('#join-messages').onclick=()=>{
  modal.close();
  modal.innerHTML=`<form><h2>Join message directory</h2><p>Your display name will be visible to other signed-in Site members.</p>${input('Display name','name',data.people[0]?.name,'text',true)}<button class="primary">Join</button> <button type="button" id="cancel-join">Cancel</button><p role="alert"></p></form>`;
  $('#cancel-join').onclick=()=>modal.close();
  modal.querySelector('form').onsubmit=async event=>{
   event.preventDefault();
   const button=event.currentTarget.querySelector('.primary');
   button.disabled=true;
   try{await messageRequest('/join',{name:new FormData(event.currentTarget).get('name')});modal.close();await refreshMessages();notify('Joined the message directory')}
   catch(error){modal.querySelector('[role="alert"]').textContent=error.message}
   finally{button.disabled=false}
  };
  modal.showModal();
 };
 modal.showModal();
}
