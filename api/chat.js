/* Jeevo planning assistant — Google AI Studio (Gemini) free tier.
   No card required. If the key is missing, rate-limited or the call fails,
   the browser falls back to the offline guided planner, so the widget
   always works.

   PRIVACY: names, emails and phone numbers are never sent here. The
   conversation is only about places, dates and budgets; contact details
   go straight to /api/enquiry and into Airtable without passing through
   any model. Free tiers of these services generally train on what they
   receive, so the fix is not to send it. */

const fs   = require('fs');
const path = require('path');

const KEY  = process.env.GEMINI_API_KEY;
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

/* Google renames these models regularly, and a model can appear in the
   list yet still 404 when called - the free tier does not grant every
   model it shows you. So rather than trusting one name, rank the usable
   models and try them in order, remembering the ones that fail. */
let MODEL_LIST = null;
const DEAD = new Set();

async function candidates() {
  if (MODEL_LIST) return MODEL_LIST;
  if (process.env.CHAT_MODEL) { MODEL_LIST = [process.env.CHAT_MODEL]; return MODEL_LIST; }

  const r = await fetch(`${BASE}/models?key=${encodeURIComponent(KEY)}`);
  if (!r.ok) throw Object.assign(new Error('list_models'), { status: r.status });
  const j = await r.json();

  const usable = (j.models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => m.name.replace(/^models\//, ''))
    .filter(n => !/embedding|aqa|image|tts|vision|audio/.test(n));

  const rank = n => {
    let s = 0;
    if (/flash/.test(n)) s += 100;           // cheapest, fastest, enough for this
    if (/lite/.test(n)) s += 10;             // even cheaper, still fine
    if (/preview|exp/.test(n)) s -= 50;      // these come and go
    if (/pro/.test(n)) s -= 20;              // heavier than needed
    const v = (n.match(/(\d+(?:\.\d+)?)/) || [])[1];
    if (v) s += Math.min(Number(v), 5);      // mildly prefer newer
    return s;
  };
  MODEL_LIST = usable.sort((a, b) => rank(b) - rank(a));
  return MODEL_LIST;
}

const MAX_TURNS = 20;
const MAX_CHARS = 1200;
/* A full day-by-day itinerary plus the wrap-up runs well past 900 tokens,
   and Google simply stops mid-sentence when it hits the ceiling - replies
   were being cut off at "A Jeevo consultant will". The free tier caps
   requests per day and tokens per minute, not the length of one reply, so
   this costs nothing. */
const MAX_OUT   = 2600;

const ALLOWED = [
  'https://jeevo-tours.vercel.app',
  'https://www.jeevotours.com',
  'https://jeevotours.com',
  'http://localhost:3000',
  'http://localhost:8899',
];

/* Anything that looks like contact details should not reach the model.
   The widget does not send them, but a visitor can always type one in. */
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/g;
const PHONE = /(\+?\d[\d\s().-]{7,}\d)/g;
function scrub(s) {
  return String(s).replace(EMAIL, '[email removed]').replace(PHONE, '[number removed]');
}

let CACHE = null;
function knowledge() {
  if (CACHE) return CACHE;
  const dir = path.join(process.cwd(), 'ai');
  CACHE = {
    rules: fs.readFileSync(path.join(dir, 'system-prompt.md'), 'utf8'),
    index: JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')),
    full:  JSON.parse(fs.readFileSync(path.join(dir, 'itineraries-full.json'), 'utf8')),
  };
  return CACHE;
}

const ALIASES = {
  'seven sisters':['shillong','bhalukpong','kohima','imphal','aizawl','agartala'],
  'northeast':['shillong','bhalukpong','kohima','imphal','aizawl','agartala'],
  'north east':['shillong','bhalukpong','kohima','imphal','aizawl','agartala'],
  meghalaya:['shillong','sohra'], arunachal:['bhalukpong'],
  nagaland:['dimapur','khonoma','kohima'], manipur:['imphal','loktak lake'],
  mizoram:['aizawl','reiek'], tripura:['agartala','neermahal'],
  assam:['dibrugarh','namphake','majuli','sivasagar','charaideo','guwahati','kaziranga'],
  'tea gardens':['dibrugarh'],
  kerala:['cochin','munnar','alleppey','periyar','kumarakom','kovalam','trivandrum'],
  backwaters:['alleppey','kumarakom'],
  rajasthan:['jaipur','jodhpur','udaipur','jaisalmer','bikaner','ranakpur','bundi'],
  'golden triangle':['delhi','agra','jaipur'], 'taj mahal':['agra'],
  'south india':['madurai','tanjore','chennai','mahabalipuram','pondicherry','ooty','mysore'],
  nepal:['kathmandu'], vietnam:['hanoi','saigon','halong'],
  ganges:['varanasi','haridwar'], tigers:['ranthambore'], wildlife:['ranthambore','periyar'],
  temples:['khajuraho','madurai','tanjore','varanasi'],
  pilgrimage:['varanasi','haridwar','ayodhya','rameshwaram'],
  yatra:['varanasi','haridwar','ayodhya','rameshwaram'],
};

function pickItineraries(text, k, max) {
  const t = text.toLowerCase();
  const wanted = new Set();
  for (const [w, places] of Object.entries(ALIASES)) if (t.includes(w)) places.forEach(p => wanted.add(p));
  const nights = Number((t.match(/(\d{1,2})\s*(?:nights?|days?)/) || [])[1]) || 0;

  return k.index.itineraries.map(it => {
    let score = t.includes(it.tour.toLowerCase()) ? 20 : 0;
    for (const place of it.route.map(r => r.toLowerCase())) {
      if (place.length > 3 && t.includes(place)) score += 10;
      for (const w of wanted) if (place.includes(w)) { score += 8; break; }
    }
    if (t.includes(it.region.toLowerCase())) score += 10;
    if (nights && score > 0) score += Math.max(0, 3 - Math.abs(it.days - nights) / 3);
    return { it, score };
  }).filter(s => s.score >= 8)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(s => k.full.find(f => f.tour === s.it.tour))
    .filter(Boolean);
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || '';
  if (ALLOWED.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(204).end();

  /* Cheap readiness probe. The widget asks this when it opens so it can
     show a real chat when there is a brain behind it, and the guided
     questions when there is not - rather than letting someone type "hi"
     and get pushed into a form. Checks the env var only; costs nothing. */
  if (req.method === 'GET') return res.status(200).json({ ready: !!KEY });

  if (req.method !== 'POST')    return res.status(405).json({ error: 'POST only' });
  /* 503 rather than 500: the widget treats it as "use the offline planner" */
  if (!KEY) return res.status(503).json({ error: 'assistant_unavailable', reason: 'no_key' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const incoming = Array.isArray(body?.messages) ? body.messages : [];

  /* The visitor picks a language in the header. Arjun has to answer in it —
     a Spanish visitor getting an English itinerary is a broken experience. */
  const LANGS = {
    en: { name: 'English',  full: "We've covered plenty here — let me pass this to a consultant who can finish it off properly. Pop your details in below and someone will come back to you." },
    fr: { name: 'French',   full: "Nous avons bien avancé — je passe la main à un conseiller qui finalisera tout cela. Laissez vos coordonnées ci-dessous et quelqu'un vous recontactera." },
    it: { name: 'Italian',  full: "Abbiamo coperto parecchio — passo ora a un consulente che finirà il lavoro come si deve. Lasciate i vostri dati qui sotto e qualcuno vi ricontatterà." },
    es: { name: 'Spanish',  full: "Ya hemos avanzado bastante — se lo paso a un asesor que lo terminará como es debido. Déjenos sus datos abajo y alguien se pondrá en contacto." },
  };
  const lang = LANGS[body?.lang] ? body.lang : 'en';
  if (!incoming.length) return res.status(400).json({ error: 'No messages' });
  if (incoming.length > MAX_TURNS) {
    return res.status(200).json({
      reply: LANGS[lang].full,
      done: true,
    });
  }

  const messages = incoming.slice(-MAX_TURNS)
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', text: scrub(m.content).slice(0, MAX_CHARS) }))
    .filter(m => m.text);

  const k = knowledge();
  const said = messages.filter(m => m.role === 'user').map(m => m.text).join(' ');
  const matches = pickItineraries(said, k, 2);

  const system =
    k.rules +
    '\n\n## Jeevo itineraries (summary)\n' + JSON.stringify(k.index.itineraries) +
    '\n\n## Road legs Jeevo has operated (real distances and drive times)\n' + JSON.stringify(k.index.routes) +
    (matches.length ? '\n\n## Closest matching itineraries, in full\n' + JSON.stringify(matches) : '') +
    '\n\n## Contact details\nNever ask for a name, email or phone number. The website collects those separately. If someone offers them, thank them and say the form below will pass them on.' +
    (lang === 'en' ? '' :
      '\n\n## Language\nThis visitor has chosen ' + LANGS[lang].name + '. Write every reply in ' +
      LANGS[lang].name + ', including any day-by-day itinerary, headings and questions. ' +
      'Do this even if they write to you in English. Leave place names, hotel names and ' +
      'our own itinerary titles in their usual form rather than translating them.');

  try {
    const models = (await candidates()).filter(m => !DEAD.has(m));
    if (!models.length) { MODEL_LIST = null; DEAD.clear(); throw new Error('no_model'); }

    let data = null, status = 0, used = null, retried429 = false;
    for (const model of models.slice(0, 4)) {
      const r = await fetch(`${BASE}/models/${model}:generateContent?key=` + encodeURIComponent(KEY), {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: messages.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
          generationConfig: { maxOutputTokens: MAX_OUT, temperature: 0.7 },
        }),
      });
      data = await r.json().catch(() => ({}));
      status = r.status; used = model;
      if (r.ok) break;
      console.error('[chat]', model, r.status, JSON.stringify(data).slice(0, 240));
      if (r.status === 404 || r.status === 400 || r.status === 403) { DEAD.add(model); continue; }
      /* A 429 is the per-minute limit, not a broken model. Pause once and
         try the same model again rather than reporting the assistant down. */
      if (r.status === 429 && !retried429) {
        retried429 = true;
        await new Promise(res2 => setTimeout(res2, 2200));
        const again = await fetch(`${BASE}/models/${model}:generateContent?key=` + encodeURIComponent(KEY), {
          method : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body   : JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: messages.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
            generationConfig: { maxOutputTokens: MAX_OUT, temperature: 0.7 },
          }),
        });
        data = await again.json().catch(() => ({}));
        status = again.status;
        if (again.ok) break;
      }
      break;                                  // anything else is not the model's fault
    }

    if (status !== 200) {
      return res.status(503).json({
        error: 'assistant_unavailable',
        reason: status === 429 ? 'rate_limited' : 'upstream',
        upstream: status, tried: used,
      });
    }

    let reply = (data?.candidates?.[0]?.content?.parts || [])
      .map(p => p.text || '').join('').trim();
    if (!reply) return res.status(503).json({ error: 'assistant_unavailable', reason: 'empty' });

    /* If it still runs out of room, trim back to the last finished sentence
       rather than leaving the visitor staring at half a word. */
    if (data?.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
      const cut = Math.max(reply.lastIndexOf('. '), reply.lastIndexOf('.\n'),
                           reply.lastIndexOf('! '), reply.lastIndexOf('? '));
      if (cut > reply.length * 0.5) reply = reply.slice(0, cut + 1);
      reply += '\n\nA Jeevo consultant will confirm the details and pricing — pop your details in below.';
    }

    /* Arjun ends with [[READY]] once he has what a consultant needs. He is
       the one having the conversation, so he judges that far better than
       pattern-matching the transcript from outside. Strip it before anyone
       sees it and pass the decision to the widget as a flag. */
    let ready = /\[\[\s*READY\s*\]\]/i.test(reply);
    reply = reply.replace(/\[\[\s*READY\s*\]\]/gi, '').replace(/\s+$/, '');

    /* He is not reliable about writing the marker - he will say "pop your
       details in below" in plain words and skip it, and then the form he
       just promised never appears. So take him at his word too. */
    /* It must be THEIR details he is asking for. "The details of the Taj
       visit are below" is about the itinerary, not a hand-off, and reading
       it as one puts the form back in the middle of a conversation. */
    const HANDOVER = [
      /\b(your|their|her|his)\s+(?:contact\s+)?details?\b/i,
      /\bcontact details?\b/i,
      /\b(name and email|email and name|name, email)\b/i,
      /\b(pop|put|leave|drop|enter|fill)\b[^.]{0,24}\b(your )?details?\b/i,
      /\bconsultant\b[^.]{0,60}\b(take it from here|be in touch|come back to you|get in touch)\b/i,
    ];
    if (!ready) ready = HANDOVER.some(re => re.test(reply));

    return res.status(200).json({ reply, ready });
  } catch (e) {
    console.error('[chat] request failed', e && e.message, e && e.status);
    return res.status(503).json({
      error: 'assistant_unavailable',
      reason: e && e.message === 'list_models' ? 'key_rejected' : 'network',
      upstream: (e && e.status) || null,
    });
  }
};
