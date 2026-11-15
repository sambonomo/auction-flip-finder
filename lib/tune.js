// The weekly retune. Reads every logged sold price and finished flip, then moves the model's numbers
// toward what really happened, in small limited steps. Pure functions so they can be tested.
const RULES = {
  hammerPct: { def: 96, lo: 80, hi: 102, step: 1.5, need: 10, label: 'Expected sale price (% of MMR)' },
  reconMult: { def: 1, lo: 0.6, hi: 1.8, step: 0.05, need: 5, label: 'Recon multiplier' },
  liftPct: { def: 9, lo: 5, hi: 14, step: 0.5, need: 8, label: 'MMR change per CR point (%)' },
};
const median = (a) => { if (!a.length) return null; const b = a.slice().sort((x, y) => x - y); const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const odd = (sold, mmr) => !(mmr > 0) || sold / mmr < 0.5 || sold / mmr > 1.4;

function evidence(sold, flips) {
  const ok = sold.filter((r) => r.sold > 0 && r.data && r.data.mmr > 0 && r.data.mmrSrc !== 'est' && !odd(r.sold, r.data.mmr));
  const box = ok.filter((r) => r.data.cond != null && r.data.cond <= 2.5);
  const use = box.length >= RULES.hammerPct.need ? box : ok;
  const done = flips.filter((f) => f && f.soldPrice > 0);
  const rec = done.filter((f) => f.actualRecon > 0 && f.projRecon > 0).map((f) => f.actualRecon / (f.projRecon / (f.rm || 1)));
  const lift = done.filter((f) => f.exit === 'auction' && f.gradeSold != null && f.crBuy != null && f.gradeSold - f.crBuy >= 0.5 && f.mmrBuy > 0)
    .map((f) => { const days = f.daysHeld != null ? f.daysHeld : (f.projDays || 21); return (f.soldPrice / (1 - 0.003 * days / 7) / f.mmrBuy - 1) / (f.gradeSold - f.crBuy) * 100; })
    .filter((x) => x > 0 && x < 30);
  const profit = done.filter((f) => f.actualProfit != null).map((f) => f.actualProfit);
  return {
    soldAll: sold.filter((r) => r.sold > 0).length, typos: sold.filter((r) => r.sold > 0 && r.data && r.data.mmr > 0 && odd(r.sold, r.data.mmr)).length,
    flipsOpen: flips.filter((f) => f && !(f.soldPrice > 0)).length, flipsDone: done.length,
    hammerPct: { n: use.length, want: median(use.map((r) => r.sold / r.data.mmr * 100)), what: use === box ? 'sold prices of CR 2.5 and under cars' : 'sold prices' },
    reconMult: { n: rec.length, want: median(rec), what: 'finished flips with actual recon' },
    liftPct: { n: lift.length, want: median(lift), what: 'finished flips re-run at a higher grade' },
    profit: { n: profit.length, avg: profit.length ? Math.round(profit.reduce((s, x) => s + x, 0) / profit.length) : null, lost: profit.filter((x) => x < 0).length },
  };
}

function retune(current, sold, flips, now) {
  // keep every number the app has tuned (resale range, held-back margin), not only the three this job moves
  const values = { ...((current && current.values) || {}) }; for (const k in RULES) values[k] = current && current.values && current.values[k] > 0 ? current.values[k] : RULES[k].def;
  const ev = evidence(sold, flips); const changes = []; const notes = [];
  for (const k of Object.keys(RULES)) {
    const R = RULES[k], e = ev[k], cur = values[k];
    if (e.n < R.need || e.want == null) { notes.push(`${R.label} stays at ${cur}: needs ${R.need} ${e.what}, has ${e.n}.`); continue; }
    const d = Math.min(R.hi, Math.max(R.lo, e.want)) - cur;
    if (Math.abs(d) < R.step / 1.5) { notes.push(`${R.label} stays at ${cur}: ${e.n} ${e.what} agree with it (${e.want.toFixed(2)}).`); continue; }
    const q = R.step < 0.1 ? 100 : 2;
    const to = Math.round((cur + Math.max(-R.step, Math.min(R.step, d))) * q) / q;
    changes.push({ at: now, key: k, from: cur, to, why: `Weekly retune: ${e.n} ${e.what} point to ${e.want.toFixed(2)}`, src: 'weekly' });
    notes.push(`${R.label} moved from ${cur} to ${to}: ${e.n} ${e.what} point to ${e.want.toFixed(2)}.`);
    values[k] = to;
  }
  const head = `${ev.soldAll} sold prices on file${ev.typos ? ` (${ev.typos === 1 ? '1 looks like a typo and was' : ev.typos + ' look like typos and were'} left out)` : ''}, ${ev.flipsDone} finished flip${ev.flipsDone === 1 ? '' : 's'}, ${ev.flipsOpen} car${ev.flipsOpen === 1 ? '' : 's'} in progress.`;
  const money = ev.profit.n ? ` Finished flips averaged $${ev.profit.avg.toLocaleString('en-US')} profit, ${ev.profit.lost} of ${ev.profit.n} lost money.` : '';
  return { values, changes, text: `${head}${money} ${notes.join(' ')}` };
}

module.exports = { RULES, evidence, retune };
