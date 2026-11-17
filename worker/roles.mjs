const ownerHash = '';
const seatTypes = ['Founder','Founder','Founder','Employee','Employee','Employee'];
const emptySeats = () => seatTypes.map(role => ({role,name:'',email:''}));

async function isAdmin(email) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2,'0')).join('') === ownerHash;
}

async function accessFor(request, db) {
  const user = request.headers.get('oai-authenticated-user-id');
  const email = request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();
  if (!user || !email) return null;
  const admin = await isAdmin(email);
  const row = admin
    ? await db.prepare('SELECT workspace_id, revision, payload FROM workspace_state WHERE workspace_id = ?').bind(user).first()
    : await db.prepare("SELECT workspace_id, revision, payload FROM workspace_state WHERE json_extract(payload, '$.orgKey') = 'svaveda' LIMIT 1").bind().first();
  const state = row ? JSON.parse(row.payload) : null;
  const seats = state?.seats || emptySeats();
  const seat = admin ? {role:'Super Admin',name:'Vansh',email} : seats.find(item => item.email === email);
  return seat ? {...seat,user,workspace:row?.workspace_id || user,revision:row?.revision || 0,state,seats} : null;
}

function validateSeats(seats, adminEmail) {
  if (!Array.isArray(seats) || seats.length !== seatTypes.length) throw Error('Configure all six team seats.');
  const emails = new Set([adminEmail]);
  const names = new Set(['vansh']);
  return seats.map((seat,i) => {
    const name = typeof seat?.name === 'string' ? seat.name.trim() : '';
    const email = typeof seat?.email === 'string' ? seat.email.trim().toLowerCase() : '';
    if (name.length > 80 || name && names.has(name.toLowerCase())) throw Error('Each seat needs a unique display name.');
    if (email && (!name || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || emails.has(email))) throw Error('Use a unique valid sign-in email and display name.');
    if (name) names.add(name.toLowerCase());
    if (email) emails.add(email);
    return {role:seatTypes[i],name,email};
  });
}

function scopedState(access) {
  if (!access.state || access.role === 'Super Admin') return access.state;
  const {seats,orgKey,attendanceByUser,messages,sheetLink,sheetSyncedAt,sheetQueue,...visible} = access.state;
  visible.messages = [];
  visible.attendance = attendanceByUser?.[access.user] || {};
  if (access.role === 'Founder') {
    const byName = new Map(visible.people.map(person => [person.name,person]));
    for (const seat of access.seats.filter(item => item.email)) {
      if (!byName.has(seat.name)) byName.set(seat.name,{name:seat.name,role:seat.role});
    }
    visible.people = [...byName.values()];
    return visible;
  }
  const own = record => record.owner === access.name;
  return {people:[{name:access.name,role:access.role}],leads:visible.leads.filter(own),tasks:visible.tasks.filter(own),
    projects:visible.projects.filter(item=>own(item)||item.members?.includes(access.name)),events:visible.events.filter(item=>!item.owner||own(item)),
    attendance:visible.attendance,messages:[],reviews:visible.reviews.filter(own),requests:(visible.requests||[]).filter(item=>item.user===access.user)};
}

function mergeTeamState(access, value) {
  const state = access.state;
  if (access.role === 'Founder') {
    for (const key of ['leads','tasks','projects','events','reviews']) state[key] = value[key];
  } else {
    const statuses = new Set(['To do','In progress','Blocked','In review','Rework']);
    for (const task of state.tasks.filter(item => item.owner === access.name)) {
      if (task.status === 'Done') continue;
      const edited = value.tasks.find(item => item?.id === task.id);
      if (!edited) continue;
      if (statuses.has(edited.status)) {
        if (edited.status==='In review' && task.status!=='In review') task.reviewAt=Date.now();
        task.status=edited.status;
      }
      if (Array.isArray(edited.comments)) task.comments = edited.comments.slice(0,100).filter(comment=>typeof comment==='string').map(comment=>comment.slice(0,2000));
      if (edited.submission && typeof edited.submission.name==='string' && edited.submission.name.length<=240 && typeof edited.submission.url==='string' && edited.submission.url.length<=940000 && /^data:[^,;]*;base64,[A-Za-z0-9+/=]+$/.test(edited.submission.url)) task.submission={name:edited.submission.name,url:edited.submission.url};
      if (Array.isArray(task.checklist)&&Array.isArray(edited.checklist)) task.checklist=task.checklist.map((item,i)=>({...item,done:edited.checklist[i]?.text===item.text?edited.checklist[i].done===true:item.done}));
      if (Number.isFinite(edited.elapsed) && edited.elapsed >= 0) task.elapsed = edited.elapsed;
      if (Number.isSafeInteger(edited.timer) && edited.timer > 0) task.timer = edited.timer;
      else delete task.timer;
    }
  }
  if(access.role!=='Founder')(state.attendanceByUser ||= {})[access.user] = value.attendance;
  return state;
}
