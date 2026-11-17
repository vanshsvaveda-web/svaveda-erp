async function messages(request, env, path) {
  const user = request.headers.get('oai-authenticated-user-id');
  const email = request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();
  if (!user || !email) return json({ error: 'Sign in to open Messages.' }, 401);
  const access = await accessFor(request, env.DB);
  if (!access) return json({ error: 'A workspace seat is required.' }, 403);

  if (path.startsWith('/api/messages/files/')) {
    if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);
    const file = await env.DB.prepare('SELECT attachment_name, attachment_data FROM direct_messages WHERE id = ? AND (sender_id = ? OR recipient_id = ?)').bind(path.split('/').at(-1), user, user).first();
    if (!file?.attachment_data) return json({ error: 'Attachment not found.' }, 404);
    return new Response(Uint8Array.from(atob(file.attachment_data), character => character.charCodeAt(0)), {
      headers: { ...privateHeaders, 'Content-Type': 'application/octet-stream', 'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(file.attachment_name).replace(/'/g, '%27') }
    });
  }
  const db = env.DB;
  const url = new URL(request.url);
  if (request.method === 'GET') {
    const directory = await db.prepare('SELECT user_id AS id, email, display_name AS name FROM message_members WHERE user_id != ? ORDER BY display_name').bind(user).all();
    const active = [];
    for (const person of directory.results) {
      if (access.seats.some(seat => seat.email === person.email) || await isAdmin(person.email)) active.push({id:person.id,name:person.name});
    }
    const records = await db.prepare(
      'SELECT id, sender_id AS sender, recipient_id AS recipient, body, attachment_name AS file, created_at AS created FROM direct_messages WHERE sender_id = ? OR recipient_id = ? ORDER BY created_at DESC, id DESC LIMIT 500'
    ).bind(user, user).all();
    return json({ user, directory: active, messages: records.results.reverse() });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  if (request.headers.get('Origin') !== url.origin || !request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'Invalid message request.' }, 403);
  let value;
  try { value = await readPayload(request); }
  catch { return json({ error: 'Invalid message or attachment.' }, 400); }
  if (path === '/api/messages/join') {
    const name = typeof value?.name === 'string' ? value.name.trim().slice(0, 80) : '';
    if (!name) return json({ error: 'Enter a display name.' }, 400);
    await db.prepare('INSERT INTO message_members (user_id, email, display_name) VALUES (?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name').bind(user, email, name).run();
    return json({ joined: true });
  }
  const { id, recipient, body, file } = value || {};
  const content = typeof body === 'string' ? body.trim() : '';
  if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id) || content.length > 5000 || (!content && !file)) return json({ error: 'Enter a message or attach a file.' }, 400);
  if (file && (typeof file.name !== 'string' || !file.name.trim() || file.name.length > 240 || typeof file.data !== 'string' ||
      file.data.length > 940000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.data))) return json({ error: 'Invalid attachment.' }, 400);
  if (recipient !== user) {
    if (typeof recipient !== 'string') return json({ error: 'Choose a conversation.' }, 400);
    const target = await db.prepare('SELECT email FROM message_members WHERE user_id = ?').bind(recipient).first();
    if (!target || !access.seats.some(seat => seat.email === target.email) && !await isAdmin(target.email)) return json({ error: 'That member has no active workspace seat.' }, 403);
    const members = await db.prepare('SELECT COUNT(*) AS count FROM message_members WHERE user_id IN (?, ?)').bind(user, recipient).first();
    if (members.count !== 2) return json({ error: 'Both members must join the workspace directory.' }, 403);
  }
  await db.prepare('INSERT INTO direct_messages (id, sender_id, recipient_id, body, attachment_name, attachment_data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING')
    .bind(id, user, recipient, content, file?.name || null, file?.data || null, Date.now()).run();
  return json({ saved: true });
}
