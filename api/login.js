// Checks a username and password against AUTH_USERS and sets a signed session cookie.
const crypto = require('crypto');

const DAYS = 30;

function readForm(req) {
  const b = req.body;
  if (b && typeof b === 'object' && !Buffer.isBuffer(b)) return b;
  const text = Buffer.isBuffer(b) ? b.toString('utf8') : typeof b === 'string' ? b : '';
  return Object.fromEntries(new URLSearchParams(text));
}

function checkPassword(record, password) {
  const [saltHex, hashHex] = String(record).split(':');
  const want = Buffer.from(hashHex || '', 'hex');
  const got = crypto.scryptSync(password, Buffer.from(saltHex || '', 'hex'), 32);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const fail = async () => {
    await new Promise((r) => setTimeout(r, 600));
    res.statusCode = 303;
    res.setHeader('Location', '/login.html?e=1');
    res.end();
  };
  if (req.method !== 'POST') { res.statusCode = 303; res.setHeader('Location', '/login.html'); return res.end(); }

  const secret = process.env.AUTH_SECRET;
  let users = {};
  try { users = JSON.parse(process.env.AUTH_USERS || '{}'); } catch { users = {}; }
  const form = readForm(req);
  const user = String(form.username || '').trim().toLowerCase();
  const password = String(form.password || '');

  if (!secret || secret.length < 16 || !/^[a-z0-9_-]{1,32}$/.test(user) || !password || password.length > 200) return fail();
  const record = Object.prototype.hasOwnProperty.call(users, user) ? users[user] : null;
  // Always do the slow hash so a wrong username takes as long as a wrong password.
  const ok = checkPassword(record || '00:00', password) && !!record;
  if (!ok) return fail();

  const mark = record.split(':')[1].slice(0, 12);
  const exp = Date.now() + DAYS * 864e5;
  const body = `${user}.${mark}.${exp}`;
  const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
  res.setHeader('Set-Cookie', `aff_s=${body}.${sig}; Path=/; Max-Age=${DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`);
  res.statusCode = 303;
  res.setHeader('Location', '/');
  res.end();
};
