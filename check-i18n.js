/* Fails if a language is only partly translated.
   The switcher once offered nine languages with almost nothing behind them:
   headings changed, sentences stayed English. Run this before adding a language
   or a data-i18n attribute.                      node check-i18n.js            */
const fs = require('fs');
global.window = {};
require('./assets/jeevo-i18n-data.js');
const { JV_I18N: LANGS, JV_STRINGS: S } = window;

const PAGES = ['index.html'];
const JS_SOURCES = fs.readdirSync('assets').filter(f => f.endsWith('.js')).map(f => 'assets/' + f);

// keys that are legitimately the same in another language (proper nouns, etc.)
// Entries that are legitimately identical to the English, as "key:lang".
// Scoped per language so a genuine oversight in another one still fails.
const SAME_OK = new Set([
  'about.title.a:fr', 'about.title.a:it', 'about.title.a:es',   // "Jeevo — "
  'rev.t1:fr', 'rev.t1:it', 'rev.t1:es',                        // Amritsar
  'rev.t2:fr', 'rev.t2:it', 'rev.t2:es',                        // Rishikesh
  'nav.contact:fr', 'f.contact:fr',                             // "Contact" is French
  'nav.dest:fr', 'f.dest:fr',                                   // "Destinations" is French
  'nav.menu:fr',                                                // "Menu" is French
]);

const used = new Set();
for (const f of [...PAGES, ...JS_SOURCES]) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/data-i18n="([^"]+)"/g)) used.add(m[1]);
  for (const m of src.matchAll(/data-i18n-ph="([^"]+)"/g)) used.add(m[1]);
}

let errors = 0;
const fail = (msg) => { console.error('  FAIL  ' + msg); errors++; };

// 1. every key the markup asks for must exist, or it silently stays English
for (const k of [...used].sort()) if (!(k in S)) fail(`"${k}" is used in the markup but not defined`);

// 2. every key must have a non-empty string in every declared language
for (const k of Object.keys(S).sort()) {
  for (const lang of Object.keys(LANGS)) {
    const v = S[k][lang];
    if (typeof v !== 'string' || !v.trim()) fail(`"${k}" has no ${lang} value`);
    else if (lang !== 'en' && v === S[k].en && !SAME_OK.has(k + ':' + lang))
      fail(`"${k}" ${lang} is identical to English - untranslated?`);
  }
}

const langs = Object.keys(LANGS).join(', ');
console.log(`${Object.keys(S).length} keys x ${Object.keys(LANGS).length} languages (${langs})`);
console.log(`${used.size} data-i18n / data-i18n-ph keys referenced across markup and JS`);
if (errors) { console.error(`\n${errors} problem(s).`); process.exit(1); }
console.log('\nOK - every key resolves in every language.');
