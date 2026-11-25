// Stable references stored alongside ordinary text; older messages remain readable.
const messageLinkKinds={task:'tasks',project:'projects',lead:'leads'};
const messageLinkPattern=/\[\[(task|project|lead|reply):([A-Za-z0-9_-]{1,128})\]\]/g;
function messageLinks(body){
 const seen=new Set();
 return [...String(body||'').matchAll(messageLinkPattern)].flatMap(([,kind,id])=>{
  const key=kind+':'+id;if(seen.has(key))return [];seen.add(key);return [{kind,id}];
 });
}
function messagePlainText(body){return String(body||'').replace(messageLinkPattern,'').trim();}
function messageLinkToken(kind,id){
 if(!['task','project','lead','reply'].includes(kind)||!/^[A-Za-z0-9_-]{1,128}$/.test(id))throw Error('Invalid workspace reference.');
 return '[['+kind+':'+id+']]';
}
function messageLinkedRecord(state,kind,id){return state?.[messageLinkKinds[kind]]?.find(item=>item.id===id);}
