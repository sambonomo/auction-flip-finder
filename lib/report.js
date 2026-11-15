// The weekly email: what was bought, what it really made, forecast against actual, and what the retune changed.
// Sends through Resend only when RESEND_API_KEY and REPORT_TO are set in the environment. Pure builder + one sender.
const usd = (n) => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const median = (a) => { if (!a.length) return null; const b = a.slice().sort((x, y) => x - y); const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };

function buildReport({ sold, flips, changes, retuneText, now }) {
  const wk = now - 7 * 864e5, day = (t) => new Date(t).toISOString().slice(0, 10);
  const real = flips.filter((f) => f && !f.demo);
  const boughtWk = real.filter((f) => f.boughtAt && Date.parse(f.boughtAt) >= wk);
  const done = real.filter((f) => f.soldPrice > 0 && f.actualProfit != null);
  const doneWk = done.filter((f) => (f.soldAt ? Date.parse(f.soldAt) : f.u || 0) >= wk);
  const open = real.filter((f) => !(f.soldPrice > 0));
  const miss = done.filter((f) => f.projProfit != null).map((f) => f.actualProfit - f.projProfit);
  const soldWk = sold.filter((r) => r.u >= wk).length;
  const total = done.reduce((s, f) => s + f.actualProfit, 0), totalWk = doneWk.reduce((s, f) => s + f.actualProfit, 0);
  const car = (f) => `${f.year || ''} ${f.make || ''} ${f.model || ''}`.trim();
  const health = [];
  if (!soldWk) health.push('No sold prices were logged this week. The model only gets sharper when results go in.');
  if (open.some((f) => f.boughtAt && now - Date.parse(f.boughtAt) > 45 * 864e5)) health.push(`${open.filter((f) => f.boughtAt && now - Date.parse(f.boughtAt) > 45 * 864e5).length} car(s) have been in the Garage over 45 days.`);
  if (miss.length >= 5 && median(miss) < -250) health.push(`Finished cars are running a median of ${usd(-median(miss))} under forecast, so bids are holding back extra margin.`);
  if (!health.length) health.push('All good: results are coming in and forecasts are in line.');
  const subject = `Flip Finder weekly: ${boughtWk.length} bought, ${doneWk.length} sold${doneWk.length ? ', ' + usd(totalWk) + ' profit' : ''}`;
  const row = (a, b) => `<tr><td style="padding:6px 12px 6px 0;color:#5a6475">${a}</td><td style="padding:6px 0;font-weight:600">${b}</td></tr>`;
  const list = (title, items) => items.length ? `<h3 style="margin:22px 0 6px;font-size:15px">${title}</h3><table style="border-collapse:collapse;font-size:14px;width:100%">${items.join('')}</table>` : '';
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a;max-width:560px;margin:0 auto;padding:8px">
<h2 style="margin:0 0 4px;font-size:20px">Flip Finder weekly report</h2><div style="color:#5a6475;font-size:13px">Week ending ${day(now)}</div>
<table style="border-collapse:collapse;font-size:15px;margin-top:14px">
${row('Cars bought this week', boughtWk.length)}${row('Cars sold this week', doneWk.length)}${row('Real profit this week', doneWk.length ? usd(totalWk) : 'none yet')}
${row('Cars still in the Garage', open.length)}${row('Real profit, all finished cars', done.length ? `${usd(total)} on ${done.length}` : 'none yet')}
${row('Forecast against actual', miss.length ? `median ${median(miss) >= 0 ? '+' : ''}${usd(median(miss))} per car on ${miss.length}` : 'needs a finished car')}
${row('Sold prices logged this week', soldWk)}</table>
${list('Bought this week', boughtWk.map((f) => row(esc(car(f)), `${usd(f.hammer)}${f.projProfit != null ? ' · forecast ' + usd(f.projProfit) : ''}`)))}
${list('Sold this week', doneWk.map((f) => row(esc(car(f)), `${usd(f.actualProfit)}${f.projProfit != null ? ' · forecast ' + usd(f.projProfit) : ''}`)))}
<h3 style="margin:22px 0 6px;font-size:15px">What the model changed</h3><p style="font-size:14px;line-height:1.5;margin:0">${changes.length ? changes.map((c) => `${esc(c.key)}: ${c.from} to ${c.to}. ${esc(c.why)}`).join('<br>') : 'Nothing moved this week.'}</p>
<p style="font-size:13px;line-height:1.5;color:#5a6475;margin:8px 0 0">${esc(retuneText)}</p>
<h3 style="margin:22px 0 6px;font-size:15px">Health</h3><p style="font-size:14px;line-height:1.5;margin:0">${health.map(esc).join('<br>')}</p></div>`;
  return { subject, html, counts: { bought: boughtWk.length, sold: doneWk.length, open: open.length } };
}

async function sendReport(report) {
  const key = process.env.RESEND_API_KEY, to = (process.env.REPORT_TO || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!key || !to.length) return { sent: false, why: 'not_configured' };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.REPORT_FROM || 'Flip Finder <onboarding@resend.dev>', to, subject: report.subject, html: report.html }),
  });
  if (!r.ok) return { sent: false, why: `resend_${r.status}` };
  return { sent: true, to: to.length };
}

module.exports = { buildReport, sendReport };
