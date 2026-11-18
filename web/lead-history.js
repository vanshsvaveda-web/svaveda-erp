function loggedFollowUps(lead) {
  return Array.isArray(lead.history)?lead.history.filter(entry=>entry&&
    (entry.kind==='follow-up'||(!entry.kind&&typeof entry.status==='string'&&
      !['Opened call dialer','Opened WhatsApp conversation'].includes(entry.note)))):[];
}

function leadInstagram(value) {
  const text=String(value??'').trim();
  const handle=text.match(/^@?([a-z0-9._]{1,30})$/i)?.[1]??
    text.match(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-z0-9._]{1,30})\/?(?:[?#].*)?$/i)?.[1];
  if(!handle||['p','reel','reels','stories','direct','explore','accounts'].includes(handle.toLowerCase()))return '';
  return handle.toLowerCase();
}
