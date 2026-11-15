// Weekly retune, run by Vercel Cron (see vercel.json). Not behind the team login, so it checks CRON_SECRET itself.
const { ready, rpc } = require('../lib/db');
const { retune } = require('../lib/tune');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const send = (code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); };
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16 || req.headers.authorization !== `Bearer ${secret}`) return send(401, { error: 'unauthorized' });
  if (!ready()) return send(503, { error: 'no_db' });
  try {
    const [sold, flipRows, tunedRows] = await Promise.all([
      rpc('aff_list', {}), rpc('aff_kv_list', { p_kind: 'flip', p_since: 0 }), rpc('aff_kv_list', { p_kind: 'tuned', p_since: 0 }),
    ]);
    const cur = (tunedRows.find((r) => r.key === 'current' && !r.gone) || {}).data || {};
    const now = Date.now();
    const out = retune(cur, sold.map((r) => ({ sold: +r.sold, data: r.data || {} })), flipRows.filter((r) => !r.gone).map((r) => r.data), now);
    const data = {
      values: out.values,
      log: [...(Array.isArray(cur.log) ? cur.log : []), ...out.changes].slice(-60),
      weekly: [...(Array.isArray(cur.weekly) ? cur.weekly : []), { at: now, text: out.text, changed: out.changes.length }].slice(-12),
    };
    await rpc('aff_kv_put', { p_user: 'weekly-retune', p_kind: 'tuned', p_rows: [{ key: 'current', u: now, data }] });
    console.log('weekly retune', JSON.stringify({ changes: out.changes.length, sold: sold.length, flips: flipRows.length }));
    return send(200, { changes: out.changes, text: out.text });
  } catch (e) {
    console.error('retune failed', String((e && e.message) || '').slice(0, 300));
    return send(502, { error: 'db' });
  }
};
