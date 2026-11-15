// Shared sold-price log. The session cookie is already checked by middleware.js.
// Talks to Supabase from the server only; the database secret never reaches the browser.
const { ready, rpc, readBody, userOf } = require('../lib/db');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const send = (code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); };
  if (!ready()) return send(503, { error: 'no_db', message: 'The shared log is not set up yet.' });
  try {
    if (req.method === 'GET') {
      const rows = await rpc('aff_list', {});
      return send(200, { rows: rows.map((r) => ({ key: r.key, by: r.by_user, sold: +r.sold, bought: !!r.bought, data: r.data || {}, u: Date.parse(r.updated_at) })) });
    }
    const body = readBody(req);
    if (req.method === 'POST') {
      const rows = (Array.isArray(body.rows) ? body.rows : []).slice(0, 500)
        .filter((r) => r && typeof r.key === 'string' && r.key.length <= 60 && +r.sold > 0)
        .map((r) => ({ key: r.key, sold: +r.sold, bought: !!r.bought, u: +r.u || Date.now(), data: r.data && typeof r.data === 'object' ? r.data : {} }));
      if (JSON.stringify(rows).length > 400000) return send(413, { error: 'too_big' });
      const n = rows.length ? await rpc('aff_upsert', { p_user: userOf(req), p_rows: rows }) : 0;
      return send(200, { saved: n });
    }
    if (req.method === 'DELETE') {
      if (typeof body.key !== 'string' || !body.key) return send(400, { error: 'no_key' });
      return send(200, { removed: await rpc('aff_delete', { p_key: body.key.slice(0, 60) }) });
    }
    return send(405, { error: 'method' });
  } catch (e) {
    console.error('results failed', String((e && e.message) || '').slice(0, 300));
    return send(502, { error: 'db', message: 'The shared log could not be reached.' });
  }
};
