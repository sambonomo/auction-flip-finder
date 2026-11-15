// Shared sold-price log. The session cookie is already checked by middleware.js.
// Talks to Supabase from the server only; the database secret never reaches the browser.
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_KEY;
const SECRET = process.env.AFF_DB_SECRET;

function readBody(req) {
  const b = req.body;
  if (b && typeof b === 'object' && !Buffer.isBuffer(b)) return b;
  try { return JSON.parse(Buffer.isBuffer(b) ? b.toString('utf8') : String(b || '{}')); } catch (e) { return {}; }
}
const userOf = (req) => { const m = /(?:^|;\s*)aff_s=([^;.]+)\./.exec(req.headers.cookie || ''); return m ? m[1].slice(0, 40) : ''; };

async function rpc(fn, args) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_secret: SECRET, ...args }),
  });
  if (!r.ok) { const t = await r.text(); throw new Error(`db ${r.status} ${t.slice(0, 200)}`); }
  return r.json();
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const send = (code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); };
  if (!URL_ || !KEY || !SECRET) return send(503, { error: 'no_db', message: 'The shared log is not set up yet.' });
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
