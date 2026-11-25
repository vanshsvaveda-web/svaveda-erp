let inbox,thread,messageBusy=false,inboxLoading=false,inboxError='';
const chatDrafts=new Map();
let chatQuery='';
const threadMessages=person=>(inbox?.messages||[]).filter(m=>m.sender===inbox.user&&m.recipient===person||m.recipient===inbox.user&&m.sender===person);
function chatPreferences(){try{return JSON.parse(localStorage.getItem('svaveda-chat-'+inbox.user))||{pins:[],read:{}}}catch{return {pins:[],read:{}}}}
function writeChatPreferences(value){try{localStorage.setItem('svaveda-chat-'+inbox.user,JSON.stringify(value))}catch{}}
const initials=name=>name.split(/\s+/).slice(0,2).map(word=>word[0]).join('').toUpperCase();
const messageDate=stamp=>new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium'}).format(stamp);
const messageTime=stamp=>new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',timeStyle:'short'}).format(stamp);
function chatDraft(){if(!chatDrafts.has(thread))chatDrafts.set(thread,{body:'',links:[],reply:'',file:null});return chatDrafts.get(thread)}
function captureChatDraft(){const form=$('#compose-message');if(form&&form.dataset.thread===thread){chatDraft().body=form.elements.body.value;}}
async function messageRequest(path='',payload,version=''){
 const response=await fetch('/api/messages'+path,payload?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}:version?{headers:{'X-Message-Version':version}}:{});
 if(response.status===204)return null;
 const result=await response.json();if(!response.ok)throw Error(result.error||'Messages are temporarily unavailable.');return result;
}
async function refreshMessages({paint=true,conditional=false}={}){
 if(inboxLoading)return;inboxLoading=true;
 try{if(!chatJoined){await messageRequest('/join',{});chatJoined=true}const next=await messageRequest('',null,conditional?inbox?.version:'');if(next){captureChatDraft();inbox=next;thread||=inbox.user;inboxError='';if(paint&&page==='Messages')renderMessages(false,true)}}
 catch(error){inboxError=error.message;if(paint&&page==='Messages'){$('#message-error')?.replaceChildren(document.createTextNode(inboxError));if(!inbox)renderMessages(false)}}
 finally{inboxLoading=false}
}
function chatReferenceLabel(link){const record=messageLinkedRecord(data,link.kind,link.id);return record?(record.title||record.name):'Record unavailable'}
function chatReference(link,remove=false){const available=messageLinkedRecord(data,link.kind,link.id);return `<button type="button" class="chat-reference" data-act="${remove?'msg-remove-link':available?'msg-open':'msg-unavailable'}" data-key="${e(link.kind+':'+link.id)}" ${!remove&&!available?'disabled':''}>${e(link.kind)} · ${e(chatReferenceLabel(link))}${remove?' ×':''}</button>`}
function renderMessages(loadIfEmpty=true,keepPosition=false){
 captureChatDraft();
 const oldHistory=$('#chat-history'),atBottom=!oldHistory||oldHistory.scrollHeight-oldHistory.scrollTop-oldHistory.clientHeight<70,oldTop=oldHistory?.scrollTop||0;
 const focused=document.activeElement?.id,selection=['chat-body','chat-message-search'].includes(focused)?[document.activeElement.selectionStart,document.activeElement.selectionEnd]:null;
 const heading=title('Messages','Conversations connected to your work.',btn('Refresh','msg-refresh')+btn('New message','msg-new','',true));
 if(!inbox){ui.innerHTML=heading+panel('Inbox',empty(inboxError?e(inboxError):'Opening messages…'));if(loadIfEmpty&&!inboxError)refreshMessages();return}
 const contacts=[{id:inbox.user,name:'Saved notes'},...inbox.directory];
 if(data.messages.length)contacts.push({id:'previous-drafts',name:'Previous drafts'});
 const contact=contacts.find(p=>p.id===thread)||contacts[0];thread=contact.id;
 const records=threadMessages(thread),preferences=chatPreferences(),incoming=records.filter(m=>m.recipient===inbox.user&&m.sender!==inbox.user);
 if(incoming.length){preferences.read[thread]=incoming.at(-1).created;writeChatPreferences(preferences)}
 contacts.sort((a,b)=>Number(preferences.pins.includes(b.id))-Number(preferences.pins.includes(a.id))||(threadMessages(b.id).at(-1)?.created||0)-(threadMessages(a.id).at(-1)?.created||0));
 const contactRows=contacts.map(person=>{const messages=threadMessages(person.id),latest=messages.at(-1),unread=messages.filter(m=>m.recipient===inbox.user&&m.sender!==inbox.user&&m.created>(preferences.read[person.id]||0)).length;
 return `<button class="chat-contact" aria-current="${person.id===thread}" data-act="msg-thread" data-key="${e(person.id)}" data-name="${e(person.name.toLowerCase())}"><span class="avatar">${e(initials(person.name))}</span><span class="chat-contact-label"><strong>${e(person.name)}${preferences.pins.includes(person.id)?' · Pinned':''}</strong><small>${e(latest?(messagePlainText(latest.body)||latest.file||'Linked work'):person.id===inbox.user?'Private to you':'Direct message')}</small></span>${unread?`<span class="unread-count">${unread}</span>`:''}</button>`}).join('');
 let previousDate='';
 const shown=records.filter(m=>!chatQuery||(messagePlainText(m.body)+' '+(m.file||'')+' '+messageLinks(m.body).filter(l=>l.kind!=='reply').map(chatReferenceLabel).join(' ')).toLowerCase().includes(chatQuery.toLowerCase()));
 const bubbles=shown.map(message=>{const date=messageDate(message.created),divider=date===previousDate?'':`<div class="message-day"><span>${e(date)}</span></div>`;previousDate=date;
 const links=messageLinks(message.body),reply=records.find(m=>m.id===links.find(l=>l.kind==='reply')?.id);
 return divider+`<article class="bubble ${message.sender===inbox.user?'outgoing':''}">${reply?'<blockquote>'+e(messagePlainText(reply.body).slice(0,150)||reply.file||'Linked work')+'</blockquote>':''}${messagePlainText(message.body)?'<div class="bubble-text">'+e(messagePlainText(message.body))+'</div>':''}<div class="chat-links">${links.filter(l=>l.kind!=='reply').map(l=>chatReference(l)).join('')}</div>${message.file?`<a class="message-file" href="/api/messages/files/${encodeURIComponent(message.id)}" download>↓ ${e(message.file)}</a>`:''}<div class="bubble-foot"><time datetime="${new Date(message.created).toISOString()}">${e(messageTime(message.created))}${message.sender===inbox.user?' · Sent':''}</time><button type="button" class="link" data-act="msg-reply" data-key="${e(message.id)}">Reply</button></div></article>`}).join('');
 const archived=thread==='previous-drafts',draft=chatDraft(),reply=records.find(m=>m.id===draft.reply);
 const history=archived?data.messages.map(m=>`<article class="bubble"><strong>To ${e(m.owner)}</strong><div class="bubble-text">${e(m.note)}</div>${m.file?.url?.startsWith('data:')?download(m.file):''}</article>`).join(''):bubbles||`<div class="chat-empty"><strong>${chatQuery?'No matching messages':thread===inbox.user?'Keep a note for yourself':'Start the conversation'}</strong><p>${chatQuery?'Try another word or clear your search.':'Write a message, attach a file, or link a task below.'}</p></div>`;
 ui.innerHTML=heading+`<div class="panel chat"><div class="chat-sidebar"><div class="chat-list-head"><strong>Conversations</strong><input id="chat-search" type="search" placeholder="Search people" aria-label="Search conversations"></div><div id="chat-contacts">${contactRows}</div></div><div class="chat-main"><div class="chat-head"><span class="avatar">${e(initials(contact.name))}</span><div><strong>${e(contact.name)}</strong><small>${archived?'Archived drafts':thread===inbox.user?'Private to you':'Updates automatically'}</small></div>${archived?'':btn(preferences.pins.includes(thread)?'Unpin':'Pin','msg-pin',thread)}</div><input id="chat-message-search" class="chat-message-search" type="search" aria-label="Search this conversation" placeholder="Search this conversation" value="${e(chatQuery)}"><div id="chat-history" class="chat-history" role="log" aria-label="Conversation history">${history}</div>${archived?'':`<form class="composer" id="compose-message" data-thread="${e(thread)}">${reply?`<div class="chat-reply-preview"><span>Replying to: ${e(messagePlainText(reply.body).slice(0,100)||reply.file||'Linked work')}</span>${btn('×','msg-clear-reply')}</div>`:''}<div class="chat-links">${draft.links.map(l=>chatReference(l,true)).join('')}</div><div class="compose-input"><textarea id="chat-body" name="body" ${messageBusy?'disabled':''} maxlength="4400" rows="2" aria-label="Message text" placeholder="Message… Use Link work to tag tasks, projects or leads">${e(draft.body)}</textarea><div class="compose-actions"><div class="actions">${btn('＃ Link work','msg-link')}${btn('@ Person','msg-mention')}<label class="file-picker"><span id="attachment-label">${e(draft.file?.name||'＋ File')}</span><input type="file" name="attachment" ${messageBusy?'disabled':''} aria-label="Attach file"></label>${draft.file?btn('×','msg-clear-file'):''}</div><button type="submit" class="primary" ${messageBusy?'disabled':''}>${messageBusy?'Sending…':thread===inbox.user?'Save note':'Send'}</button></div><small>Enter to send · Shift + Enter for a new line</small></div><div id="message-error" role="alert">${e(inboxError)}</div></form>`}</div></div>`;
 $('#chat-search').oninput=event=>{const term=event.target.value.trim().toLowerCase();$('#chat-contacts').querySelectorAll('button').forEach(button=>button.hidden=!button.dataset.name.includes(term))};
 $('#chat-message-search').oninput=event=>{chatQuery=event.target.value;renderMessages(false,true);$('#chat-message-search').focus()};
 const historyBox=$('#chat-history');historyBox.scrollTop=keepPosition&&!atBottom?oldTop:historyBox.scrollHeight;
 if(!archived){const form=$('#compose-message');form.elements.body.oninput=captureChatDraft;form.elements.attachment.onchange=event=>{draft.file=event.target.files[0]||null;$('#attachment-label').textContent=draft.file?.name||'＋ File'};
 form.elements.body.onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();form.requestSubmit()}};form.onsubmit=sendMessage;}
 if(keepPosition&&focused){document.getElementById(focused)?.focus();if(selection)document.getElementById(focused)?.setSelectionRange(...selection)}
}
async function sendMessage(event){
 event.preventDefault();if(messageBusy)return;captureChatDraft();
 const recipient=thread,draft=chatDraft(),body=[draft.body.trim(),...draft.links.map(l=>messageLinkToken(l.kind,l.id)),draft.reply?messageLinkToken('reply',draft.reply):''].filter(Boolean).join('\n');
 if(!body&&!draft.file){$('#message-error').textContent='Write a message, link work or attach a file.';return}
 messageBusy=true;inboxError='';renderMessages(false,true);
 try{const attachment=await attach(draft.file),file=attachment?{name:attachment.name,data:attachment.url.split(',')[1]}:null;
 const signature=JSON.stringify({recipient,body,file});if(draft.pending?.signature!==signature)draft.pending={signature,id:id()};
 await messageRequest('',{id:draft.pending.id,recipient,body,file});draft.pending=null;
 chatDrafts.delete(recipient);const textarea=$('#chat-body');if(textarea)textarea.value='';
 await refreshMessages({paint:false});
 }catch(error){inboxError=error.message}
 finally{messageBusy=false;if(page==='Messages')renderMessages(false,true)}
}
function openChatLinkPicker(){
 captureChatDraft();const all=Object.entries(messageLinkKinds).flatMap(([kind,key])=>(data[key]||[]).map(record=>({kind,id:record.id,label:record.title||record.name})));
 modal.innerHTML='<h2>Link work</h2><p>Choose a task, project or lead. Both people need access to the linked record.</p><input id="chat-link-search" type="search" placeholder="Search work" aria-label="Search work"><div id="chat-link-results" class="message-picker"></div><button id="chat-link-close">Close</button>';
 const paint=()=>{const query=$('#chat-link-search').value.toLowerCase();$('#chat-link-results').innerHTML=all.filter(l=>l.label.toLowerCase().includes(query)).slice(0,40).map(l=>`<button type="button" data-reference="${e(l.kind+':'+l.id)}"><small>${e(l.kind)}</small> ${e(l.label)}</button>`).join('')||'<p>No matching work.</p>'};
 $('#chat-link-search').oninput=paint;$('#chat-link-results').onclick=event=>{const button=event.target.closest('[data-reference]');if(!button)return;const [kind,id]=button.dataset.reference.split(':');const draft=chatDraft();if(draft.links.length>=7){notify('Link up to seven work records per message.');return}if(!draft.links.some(l=>l.kind===kind&&l.id===id))draft.links.push({kind,id});modal.close();renderMessages();$('#chat-body').focus()};$('#chat-link-close').onclick=()=>modal.close();paint();modal.showModal();$('#chat-link-search').focus();
}
function messageAction(act,key){
 if(messageBusy)return;captureChatDraft();
 if(act==='msg-refresh'){refreshMessages();return}
 if(act==='msg-thread'){thread=key;chatQuery='';renderMessages();return}
 if(act==='msg-pin'){const p=chatPreferences();p.pins=p.pins.includes(key)?p.pins.filter(i=>i!==key):[...p.pins,key];writeChatPreferences(p);renderMessages();return}
 if(act==='msg-link'){openChatLinkPicker();return}
 if(act==='msg-remove-link'){chatDraft().links=chatDraft().links.filter(l=>l.kind+':'+l.id!==key);renderMessages();return}
 if(act==='msg-clear-file'){chatDraft().file=null;renderMessages();return}
 if(act==='msg-reply'){chatDraft().reply=key;renderMessages();$('#chat-body').focus();return}
 if(act==='msg-clear-reply'){chatDraft().reply='';renderMessages();return}
 if(act==='msg-mention'){
 modal.innerHTML='<h2>Mention a person</h2><p>Add their name to your message. This stays within this conversation.</p><div class="message-picker">'+data.people.map((p,i)=>`<button data-mention="${i}">${e(p.name)}</button>`).join('')+'</div><button id="chat-mention-close">Close</button>';
 modal.querySelectorAll('[data-mention]').forEach(b=>b.onclick=()=>{chatDraft().body+=' @'+data.people[Number(b.dataset.mention)].name+' ';modal.close();const field=$('#chat-body');if(field)field.value=chatDraft().body;field?.focus()});$('#chat-mention-close').onclick=()=>modal.close();modal.showModal();return}
 if(act!=='msg-new')return;if(!inbox){refreshMessages();return}
 modal.innerHTML='<h2>New message</h2><div class="message-picker">'+[{id:inbox.user,name:'Saved notes'},...inbox.directory].map(p=>`<button data-person="${e(p.id)}">${e(p.name)}</button>`).join('')+'</div><p>Team members appear after opening Messages.</p><button id="chat-join">Join / refresh directory</button> <button id="chat-picker-close">Close</button>';
 modal.querySelectorAll('[data-person]').forEach(b=>b.onclick=()=>{thread=b.dataset.person;chatQuery='';modal.close();renderMessages();$('#chat-body')?.focus()});$('#chat-picker-close').onclick=()=>modal.close();$('#chat-join').onclick=async()=>{try{await messageRequest('/join',{});modal.close();await refreshMessages();notify('Directory updated')}catch(error){notify(error.message)}};modal.showModal();
}
let chatJoined=false;
setInterval(async()=>{if(document.visibilityState!=='visible'||page!=='Messages'||messageBusy||modal.open)return;if(!chatJoined){try{await messageRequest('/join',{});chatJoined=true}catch{}}await refreshMessages({conditional:true})},15000);
