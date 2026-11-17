function parseSheetLink(link) {
  let url;
  try {url = new URL(link)} catch {throw Error('Paste a Google Sheets link.')}
  const file = url.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]{15,150})(?:\/|$)/)?.[1];
  const gid = new URLSearchParams(url.hash.slice(1)).get('gid') ?? url.searchParams.get('gid');
  if (url.origin !== 'https://docs.google.com' || !file || gid!==null&&!/^\d{1,12}$/.test(gid)) throw Error('Paste a standard Google Sheets link to the desired tab.');
  return {file,gid};
}
const sheetTokenUrl = 'https://oauth2.googleapis.com/token';
const base64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const sheetTimeout=env=>AbortSignal.timeout(Math.max(1,Math.min(12000,(env.sheetDeadline??Infinity)-Date.now())));
async function sheetToken(env,write=false) {
  const {client_email,private_key} = JSON.parse(env.GOOGLE_SHEETS_SERVICE_ACCOUNT);
  const pem = private_key.replace('-----BEGIN PRIVATE KEY-----','').replace('-----END PRIVATE KEY-----','').replace(/\s/g,'');
  const key = await crypto.subtle.importKey('pkcs8',Uint8Array.from(atob(pem),c=>c.charCodeAt(0)),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const encode = value => base64url(new TextEncoder().encode(JSON.stringify(value)));
  const iat=Math.floor(Date.now()/1000);
  const claims=encode({alg:'RS256',typ:'JWT'})+'.'+encode({iss:client_email,scope:'https://www.googleapis.com/auth/spreadsheets'+(write?'':'.readonly'),aud:sheetTokenUrl,iat,exp:iat+3600});
  const signature=base64url(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(claims))));
  const response=await fetch(sheetTokenUrl,{method:'POST',body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:claims+'.'+signature}),signal:sheetTimeout(env)});
  if(!response.ok)throw Error('Google rejected the configured service account.');
  return (await response.json()).access_token;
}
async function boundedText(response) {
  if (!response.body) return '';
  const reader=response.body.getReader(), decoder=new TextDecoder();
  let size=0,text='';
  for (;;) {
    const {done,value}=await reader.read();
    if(done)return text+decoder.decode();
    size+=value.byteLength;
    if(size>750000){await reader.cancel();throw Error('This sheet is too large for one import. Use a smaller tab or CSV.')}
    text+=decoder.decode(value,{stream:true});
  }
}
async function previewSheet(request,env) {
  const access=await accessFor(request,env.DB);
  if(access?.role!=='Super Admin')return json({error:'Only the Super Admin can import from a Sheet link.'},403);
  if(request.method!=='POST')return json({error:'Method not allowed.'},405);
  if(request.headers.get('Origin')!==new URL(request.url).origin||!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Invalid Sheet request.'},403);
  try {
    const {link,startRow=1}=await readPayload(request);
    if(!Number.isSafeInteger(startRow)||startRow<1)throw Error('Invalid Sheet row.');
    const {file,gid}=parseSheetLink(link);
    const options={};
    let csv,nextRow=null;
    if(env.GOOGLE_SHEETS_SERVICE_ACCOUNT){
      const token=await sheetToken(env);
      options.headers={Authorization:'Bearer '+token};
      const base='https://sheets.googleapis.com/v4/spreadsheets/'+file;
      const metadata=await fetch(base+'?fields=sheets(properties(sheetId,title,index,gridProperties(rowCount)))',{...options,signal:AbortSignal.timeout(12000)});
      if(!metadata.ok)throw Error('Share this Sheet with the configured Google service account, then try again.');
      const tabs=(JSON.parse(await boundedText(metadata)).sheets||[]).map(tab=>tab.properties).sort((a,b)=>a.index-b.index);
      const tab=gid===null?tabs[0]:tabs.find(item=>String(item.sheetId)===gid);
      if(!tab)throw Error('The linked tab was not found.');
      const tabName="'"+tab.title.replace(/'/g,"''")+"'";
      const rowCount=tab.gridProperties?.rowCount;
      if(!Number.isSafeInteger(rowCount)||rowCount<1)throw Error('The selected tab has no readable grid.');
      if(startRow>rowCount)throw Error('Sheet rows changed during import. Try again.');
      const lastRow=Math.min(startRow+249,rowCount);
      const range=tabName+'!A'+startRow+':AZ'+lastRow;
      const response=await fetch(base+'/values/'+encodeURIComponent(range),{...options,signal:AbortSignal.timeout(12000)});
      if(!response.ok)throw Error('Google could not read the selected tab.');
      const rows=JSON.parse(await boundedText(response)).values||[];
      csv=rows.map(row=>row.map(value=>'"'+String(value).replace(/"/g,'""')+'"').join(',')).join('\n');
      if(lastRow<rowCount)nextRow=lastRow+1;
    }else{
      const response=await fetch('https://docs.google.com/spreadsheets/d/'+file+'/export?format=csv'+(gid===null?'':'&gid='+gid),{...options,signal:AbortSignal.timeout(12000)});
      if(!response.ok||!/^(text\/csv|application\/octet-stream)/i.test(response.headers.get('Content-Type')||'')){
        throw Error('Google did not allow a link read. Private Sheets require a configured service account. You can also upload a CSV.');
      }
      csv=await boundedText(response);
    }
    return json({csv,nextRow});
  }catch(error){
    return json({error:error instanceof SyntaxError?'Google returned an unreadable response.':error.message||'The Sheet could not be read.'},400);
  }
}

const sheetWriteFields = {
  name:['nameexpert','expertname','name'],
  phone:['contactnumbergeneral','phone','phonenumber','contactnumber','mobile'],
  owner:['teammember','assignedto','assignee','owner'],
  action:['nextaction','task','todo'],
  due:['followupdate','nextfollowup','duedate'],
  status:['pipelinestatus','leadstatus','status'],
  instructions:['instructions'],
  note:['remarks','notes']
};
const sheetHeaderKey = value => String(value??'').toLowerCase().replace(/[^a-z0-9]/g,'');
const sheetPhone = value => String(value??'').replace(/\D/g,'').replace(/^91(?=\d{10}$)/,'');
function sheetColumn(index) {
  let result='';
  for(let n=index+1;n;n=Math.floor((n-1)/26))result=String.fromCharCode(65+(n-1)%26)+result;
  return result;
}

async function writeSheetLead(request,env) {
  const access=await accessFor(request,env.DB);
  if(access?.role!=='Super Admin')return json({error:'Only the Super Admin can write to the connected Sheet.'},403);
  if(request.method!=='POST')return json({error:'Method not allowed.'},405);
  if(request.headers.get('Origin')!==new URL(request.url).origin||!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Invalid Sheet request.'},403);
  const body=await readPayload(request).catch(()=>null);
  if(typeof body?.id!=='string')return json({error:'A lead ID is required.'},400);
  return syncSheetLead(access,env,body.id);
}

async function runScheduledSheetSync(env){
  const deadline=Date.now()+25000;
  const outcome={processed:0,succeeded:0,failed:0};
  const attempted=new Set();
  while(outcome.processed<5&&Date.now()<deadline-5000){
    const row=await env.DB.prepare("SELECT workspace_id, revision, payload FROM workspace_state WHERE json_extract(payload, '$.orgKey') = 'svaveda' LIMIT 1").bind().first();
    if(!row)break;
    const state=JSON.parse(row.payload);
    if(!state.sheetLink)break;
    const eligible=Object.entries(state.sheetQueue||{})
      .filter(([id,job])=>!attempted.has(id)&&job.nextAt<=Date.now())
      .sort((a,b)=>a[1].nextAt-b[1].nextAt)[0];
    if(!eligible)break;
    const [id]=eligible;
    attempted.add(id);
    const response=await syncSheetLead({state,workspace:row.workspace_id,revision:row.revision},{...env,sheetDeadline:deadline},id);
    outcome.processed++;
    if(response.ok)outcome.succeeded++;
    else outcome.failed++;
  }
  return json(outcome);
}

async function syncSheetLead(access,env,id){
  const finish=async error=>{
    const queue=access.state?.sheetQueue;
    const job=queue&&Object.hasOwn(queue,id)?queue[id]:null;
    if(!job)return;
    if(error){
      const attempts=job.attempts+1;
      access.state.sheetQueue[id]={attempts,nextAt:Date.now()+Math.min(3600000,30000*2**Math.min(attempts,7)),error:error.message.slice(0,250)};
    }else delete access.state.sheetQueue[id];
    await env.DB.prepare('UPDATE workspace_state SET revision = revision + 1, payload = ?, updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ? AND revision = ?')
      .bind(JSON.stringify(access.state),access.workspace,access.revision).run();
  };
  try {
    const lead=access.state?.leads?.find(item=>item.id===id);
    const link=access.state?.sheetLink;
    if(!lead||!link||!env.GOOGLE_SHEETS_SERVICE_ACCOUNT)throw Error('A saved lead and an authenticated Sheet connection are required.');
    const identity=sheetPhone(lead.sheetSnapshot?.phone||lead.phone);
    if(!identity)throw Error('This lead has no valid phone number for matching.');
    const {file,gid}=parseSheetLink(link);
    const token=await sheetToken(env,true);
    const base='https://sheets.googleapis.com/v4/spreadsheets/'+file;
    const google=async (path,body)=>{
      if(Date.now()>=(env.sheetDeadline??Infinity))throw Error('Sheet request exceeded the batch time budget.');
      const response=await fetch(base+path,{
        headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
        signal:sheetTimeout(env),
        ...(body?{method:'POST',body:JSON.stringify(body)}:{})
      });
      if(!response.ok)throw Error('Google Sheets rejected the request ('+response.status+').');
      return JSON.parse(await boundedText(response));
    };
    const metadata=await google('?fields=sheets(properties(sheetId,title,index,gridProperties(rowCount,columnCount)))');
    const tabs=metadata.sheets.map(({properties})=>properties).sort((a,b)=>a.index-b.index);
    const tab=gid===null?tabs[0]:tabs.find(item=>String(item.sheetId)===gid);
    if(!tab?.gridProperties)throw Error('The connected tab is unavailable.');
    const title="'"+tab.title.replace(/'/g,"''")+"'";
    const {columnCount,rowCount}=tab.gridProperties;
    const values=async range=>(await google('/values/'+encodeURIComponent(title+'!'+range)+'?valueRenderOption=FORMULA')).values||[];
    const headers=await values('A1:'+sheetColumn(columnCount-1)+Math.min(35,rowCount));
    let columns,headerRow;
    for(const [index,row] of headers.entries()){
      const keys=row.map(sheetHeaderKey);
      const mapped=Object.fromEntries(Object.entries(sheetWriteFields).map(([field,aliases])=>[field,aliases.map(alias=>keys.indexOf(alias)).find(i=>i>=0)??-1]));
      if(mapped.name<0||mapped.phone<0)continue;
      columns=mapped;
      headerRow=index+1;
      break;
    }
    if(!columns)throw Error('No matching lead headers were found.');
    const phoneColumn=sheetColumn(columns.phone);
    const matches=[];
    const newPhone=sheetPhone(lead.phone);
    let newPhoneExists=false;
    for(let first=headerRow+1;first<=rowCount;first+=1000){
      const phones=await values(phoneColumn+first+':'+phoneColumn+Math.min(first+999,rowCount));
      phones.forEach((row,index)=>{
        const phone=sheetPhone(row[0]);
        if(phone===identity)matches.push(first+index);
        if(phone===newPhone&&phone!==identity)newPhoneExists=true;
      });
    }
    if(matches.length>1||newPhoneExists)throw Error('Multiple leads could match this phone number. Resolve the duplicate before writing.');
    if(!matches.length){
      if(lead.sheetSnapshot||lead.source==='Google Sheets')throw Error('The previously imported Sheet row is missing. Review before recreating it.');
      if(!env.SHEET_WRITES_SERIALIZED)throw Error('New rows require the serialized Vercel Sheet writer.');
      const cells=Array(Math.max(...Object.values(columns))+1).fill('');
      for(const [field,column] of Object.entries(columns)){
        if(column>=0)cells[column]=String(lead[field]??'');
      }
      const range=title+'!A'+headerRow+':'+sheetColumn(cells.length-1);
      await google('/values/'+encodeURIComponent(range)+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',{values:[cells]});
      await finish();
      return json({created:true,updatedCells:0});
    }
    const rowNumber=matches[0];
    const [row=[]]=await values('A'+rowNumber+':'+sheetColumn(columnCount-1)+rowNumber);
    if(sheetPhone(row[columns.phone])!==identity)throw Error('The Sheet row moved. Retry after refreshing.');
    if(!lead.sheetSnapshot){
      const matchesSavedLead=Object.entries(columns).every(([field,column])=>column<0||field==='phone'||String(row[column]??'').trim()===String(lead[field]??'').trim());
      if(!matchesSavedLead)throw Error('This phone already exists in the Sheet. Import it before updating the existing row.');
      await finish();
      return json({updatedCells:0});
    }
    const updates=[];
    for(const [field,column] of Object.entries(columns)){
      if(column<0||field==='phone')continue;
      const before=String(lead.sheetSnapshot[field]??'').trim();
      const after=String(lead[field]??'').trim();
      const actual=String(row[column]??'').trim();
      if(before===after||actual===after)continue;
      if(actual.startsWith('=')||actual!==before)throw Error('The Sheet '+field+' differs from the last import. Review the conflict before writing.');
      updates.push({range:title+'!'+sheetColumn(column)+rowNumber,values:[[after]]});
    }
    if(updates.length)await google('/values:batchUpdate',{valueInputOption:'RAW',data:updates});
    await finish();
    return json({updatedCells:updates.length});
  }catch(error){
    await finish(error);
    return json({error:error instanceof SyntaxError?'Google returned an unreadable response.':error.message||'The Sheet write failed.'},400);
  }
}
