// AI second opinion on auction cars. The session cookie is already checked by middleware.js.
// The key lives only in the ANTHROPIC_API_KEY environment variable on Vercel and never reaches the browser.
const Anthropic = require('@anthropic-ai/sdk');

const MODEL = process.env.AI_MODEL || 'claude-opus-5-5';
const MAX_CARS = 8;

const SYSTEM = `You are the second opinion for a small used-car flipping business that buys at Manheim Dallas and Manheim Dallas-Fort Worth.

The business: buy rough cars (Manheim condition grade 2.5 or lower), recondition them at discounted shop rates for under $2,000, and re-run them at auction at grade 4.0 or better. Typical goal is $750 to $1,500 profit per car. They avoid frame or structural damage, flood, salvage or rebuilt titles, true mileage unknown, airbag problems, major mechanical problems and hail.

A spreadsheet-style model has already scored each car from the run list. You get the car and the model's numbers. Your job is to catch what a formula cannot: weak or strong resale demand for that exact year, make, model and trim; known expensive failures for that powertrain at that mileage; mileage or age that makes a grade 4.0 unrealistic; an MMR that looks out of line for the vehicle; sellers and vehicle types that tend to hide problems; electric and hybrid battery risk; and recon that will likely run over.

Be honest about what you know:
- You cannot look up live MMR, KBB, or any listing. Every value you give is your own estimate from general market knowledge, and it can be out of date. Never present a number as a KBB or MMR quote.
- The run list usually has no damage announcements. Without a condition report, your recon number is a typical figure for that grade, age and mileage, not an inspection.
- If you do not know a vehicle well, say so in the reason and use low confidence.

For each car return:
- call: "buy" only if you would put money on it at the model's max bid, "maybe" if it depends on an inspection or a lower price, "pass" if you would walk.
- confidence: low, medium or high.
- recon_est: your dollar estimate to bring the car to the target grade at the shop's discounted rates.
- lines: only when a condition report is given, the repairs it supports, chosen strictly from the price book ids provided, with whole-number quantities. Otherwise an empty list.
- value_at_target: your estimate of what this car brings at a dealer auction at the target grade.
- retail_est: your estimate of typical dealer retail asking price in clean condition.
- fixes: corrections to the uploaded data, only for clear data-entry errors: an odometer that is obviously in the wrong units or missing a digit, a model year that cannot be right, a grade outside 0 to 5, or an MMR that is off by a factor such as a dropped digit. Give the field, the corrected value and a short why. Do not "fix" an MMR because you would value the car differently; put that view in value_at_target. Most cars need no fixes, so return an empty list.
- flags: up to three short phrases, each a specific risk or strength for this vehicle. No generic advice.
- reason: one plain sentence a buyer can read on a phone in the lane.

Judge each car on its own. Do not copy the model's call; disagree when you have a reason and say why.`;

const SCHEMA = {
  type: 'object',
  properties: {
    cars: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          call: { type: 'string', enum: ['buy', 'maybe', 'pass'] },
          confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
          recon_est: { type: 'integer' },
          lines: {
            type: 'array',
            items: {
              type: 'object',
              properties: { id: { type: 'string' }, qty: { type: 'integer' } },
              required: ['id', 'qty'],
              additionalProperties: false,
            },
          },
          value_at_target: { type: 'integer' },
          retail_est: { type: 'integer' },
          fixes: {
            type: 'array',
            items: {
              type: 'object',
              properties: { field: { type: 'string', enum: ['mmr', 'cond', 'miles', 'year'] }, value: { type: 'number' }, why: { type: 'string' } },
              required: ['field', 'value', 'why'],
              additionalProperties: false,
            },
          },
          flags: { type: 'array', items: { type: 'string' } },
          reason: { type: 'string' },
        },
        required: ['id', 'call', 'confidence', 'recon_est', 'lines', 'value_at_target', 'retail_est', 'fixes', 'flags', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['cars'],
  additionalProperties: false,
};

const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]+/g, ' ').slice(0, n);
const num = (v) => (Number.isFinite(+v) && v !== null && v !== '' ? Math.round(+v * 10) / 10 : null);

function cleanCar(c, i) {
  return {
    id: str(c.id || 'car' + i, 40),
    year: num(c.year), make: str(c.make, 30), model: str(c.model, 60), miles: num(c.miles),
    grade: num(c.cond), mmr_at_current_grade: num(c.mmr), mmr_is_estimate: !!c.mmrEst,
    seller: str(c.seller, 60), auction: str(c.auction, 40), announcements: str(c.notes, 600),
    condition_report: str(c.report, 6000),
    model_says: {
      call: str(c.verdict, 10), recon: num(c.recon), value_at_target: num(c.resale),
      max_bid: num(c.max), expected_hammer: num(c.bid), profit_at_expected_hammer: num(c.profit),
      odds_of_floor_profit: num(c.odds),
    },
  };
}

function readBody(req) {
  const b = req.body;
  if (b && typeof b === 'object' && !Buffer.isBuffer(b)) return b;
  try { return JSON.parse(Buffer.isBuffer(b) ? b.toString('utf8') : String(b || '{}')); } catch (e) { return {}; }
}

async function ask(client, params) {
  // Ask for the automatic fallback model first; if this API version does not accept it, ask without it.
  try {
    return await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
  } catch (e) {
    if (e instanceof Anthropic.BadRequestError) { console.warn('ai fallback option not accepted, retrying without it:', String(e.message).slice(0, 200)); return client.messages.create(params); }
    throw e;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const send = (code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); };

  if (req.method === 'GET') return send(200, { ready: !!process.env.ANTHROPIC_API_KEY });
  if (req.method !== 'POST') return send(405, { error: 'method' });
  if (!process.env.ANTHROPIC_API_KEY) return send(503, { error: 'no_key', message: 'AI is not set up yet. Add ANTHROPIC_API_KEY in the Vercel project settings and redeploy.' });

  const body = readBody(req);
  const cars = (Array.isArray(body.cars) ? body.cars : []).slice(0, MAX_CARS).map(cleanCar);
  if (!cars.length) return send(400, { error: 'no_cars' });
  const ctx = body.ctx && typeof body.ctx === 'object' ? body.ctx : {};
  const book = (Array.isArray(ctx.book) ? ctx.book : []).slice(0, 60).map((b) => `${str(b.id, 24)}: ${str(b.label, 60)} ($${num(b.cost)})`).join('\n');

  const user = [
    `Target resale grade: ${num(ctx.sellGrade) || 4}. Profit floor $${num(ctx.minP) || 750}, target $${num(ctx.target) || 1500}. Recon cap $${num(ctx.cap) || 2000}.`,
    `The model assumes a grade point is worth ${num(ctx.liftPct) || 9}% of MMR, recon costs $${num(ctx.reconPt) || 750} per grade point when there are no announcements, and cars like these hammer at ${num(ctx.hammerPct) || 92}% of MMR.`,
    ctx.sold ? `What this buyer has actually seen so far: ${str(ctx.sold, 400)}` : 'No real sale results are logged yet.',
    book ? `Recon price book (id: label (cost)):\n${book}` : '',
    `Cars to review (${cars.length}):`,
    JSON.stringify(cars),
  ].filter(Boolean).join('\n\n');

  const client = new Anthropic({ maxRetries: 1, timeout: 55000 });
  try {
    const msg = await ask(client, {
      model: MODEL,
      max_tokens: 8000,
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: user }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    });
    if (msg.stop_reason === 'refusal') return send(502, { error: 'refused', message: 'The AI declined to review these cars.' });
    if (msg.stop_reason === 'max_tokens') return send(502, { error: 'too_long', message: 'The AI answer was cut off. Try fewer cars at once.' });
    const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    let out;
    try { out = JSON.parse(text); } catch (e) { return send(502, { error: 'bad_answer', message: 'The AI answer could not be read.' }); }
    const ids = new Set(cars.map((c) => c.id));
    const reviewed = (out.cars || []).filter((c) => ids.has(c.id));
    console.log('ai review', JSON.stringify({ cars: cars.length, answered: reviewed.length, model: msg.model, in: msg.usage.input_tokens, out: msg.usage.output_tokens }));
    return send(200, { cars: reviewed, model: msg.model, usage: { in: msg.usage.input_tokens, out: msg.usage.output_tokens } });
  } catch (e) {
    console.error('ai review failed', e && e.status, e && e.name, String((e && e.message) || '').slice(0, 300));
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return send(503, { error: 'bad_key', message: 'The Claude API key was rejected. Check ANTHROPIC_API_KEY in Vercel.' });
    if (e instanceof Anthropic.RateLimitError) return send(429, { error: 'rate_limited', message: 'The AI is busy. It will try again shortly.' });
    if (e instanceof Anthropic.APIError) return send(502, { error: 'api', message: `The AI service returned an error (${e.status || 'network'}).` });
    return send(500, { error: 'server', message: 'The AI review failed.' });
  }
};
