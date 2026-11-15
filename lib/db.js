// Server-side access to the shared Supabase database. Every call goes through a secret-checked function.
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_KEY;
const SECRET = process.env.AFF_DB_SECRET;

const ready = () => !!(URL_ && KEY && SECRET);

async function rpc(fn, args) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_secret: SECRET, ...args }),
  });
  if (!r.ok) { const t = await r.text(); throw new Error(`db ${r.status} ${t.slice(0, 200)}`); }
  return r.json();
}

function readBody(req) {
  const b = req.body;
  if (b && typeof b === 'object' && !Buffer.isBuffer(b)) return b;
  try { return JSON.parse(Buffer.isBuffer(b) ? b.toString('utf8') : String(b || '{}')); } catch (e) { return {}; }
}

const userOf = (req) => { const m = /(?:^|;\s*)aff_s=([^;.]+)\./.exec(req.headers.cookie || ''); return m ? m[1].slice(0, 40) : ''; };

module.exports = { ready, rpc, readBody, userOf };
