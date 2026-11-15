// Shared Garage, AI results and tuned model numbers. The session cookie is already checked by middleware.js.
const { ready, rpc, readBody, userOf } = require('../lib/db');

const KINDS = new Set(['flip', 'ai', 'tuned']);

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const send = (code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); };
  if (!ready()) return send(503, { error: 'no_db', message: 'The shared database is not set up yet.' });
  try {
    if (req.method === 'GET') {
      const q = new URL(req.url, 'http://x').searchParams;
      const kind = q.get('kind');
      if (!KINDS.has(kind)) return send(400, { error: 'kind' });
      const rows = await rpc('aff_kv_list', { p_kind: kind, p_since: +q.get('since') || 0 });
      return send(200, { rows: rows.map((r) => ({ key: r.key, by: r.by_user, gone: !!r.gone, data: r.data || {}, u: Date.parse(r.updated_at) })) });
    }
    if (req.method === 'POST') {
      const body = readBody(req);
      if (!KINDS.has(body.kind)) return send(400, { error: 'kind' });
      const rows = (Array.isArray(body.rows) ? body.rows : []).slice(0, 500)
        .filter((r) => r && typeof r.key === 'string' && r.key && r.key.length <= 80)
        .map((r) => ({ key: r.key, gone: !!r.gone, u: +r.u || Date.now(), data: r.data && typeof r.data === 'object' ? r.data : {} }));
      if (JSON.stringify(rows).length > 600000) return send(413, { error: 'too_big' });
      const n = rows.length ? await rpc('aff_kv_put', { p_user: userOf(req), p_kind: body.kind, p_rows: rows }) : 0;
      return send(200, { saved: n });
    }
    return send(405, { error: 'method' });
  } catch (e) {
    console.error('share failed', String((e && e.message) || '').slice(0, 300));
    return send(502, { error: 'db', message: 'The shared database could not be reached.' });
  }
};
