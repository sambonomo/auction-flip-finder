// Gate every page behind the team login. Runs on Vercel before any file is served.
export const config = {
  matcher: ['/((?!login\\.html$|api/login$|api/logout$|icon\\.svg$|manifest\\.webmanifest$|robots\\.txt$).*)'],
};

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

function sameText(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function validSession(cookieHeader) {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) return false;
  const m = /(?:^|;\s*)aff_s=([^;]+)/.exec(cookieHeader || '');
  if (!m) return false;
  const parts = m[1].split('.');
  if (parts.length !== 4) return false;
  const [user, mark, exp, sig] = parts;
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  let users;
  try { users = JSON.parse(process.env.AUTH_USERS || '{}'); } catch { return false; }
  const rec = users[user];
  if (typeof rec !== 'string' || rec.split(':')[1]?.slice(0, 12) !== mark) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const want = hex(await crypto.subtle.sign('HMAC', key, enc.encode(`${user}.${mark}.${exp}`)));
  return sameText(want, sig);
}

export default async function middleware(request) {
  if (await validSession(request.headers.get('cookie'))) {
    return new Response(null, { headers: { 'x-middleware-next': '1' } });
  }
  return new Response(null, {
    status: 302,
    headers: { Location: new URL('/login.html', request.url).toString(), 'Cache-Control': 'no-store' },
  });
}
