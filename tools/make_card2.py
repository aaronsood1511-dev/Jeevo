#!/usr/bin/env python3
"""Builds the Jeevo business card on the peacock / globe / skyline design.

The artwork plate in card2-art/ was lifted off the reference mockup: the
printed text was inpainted away and the remaining art re-laid for a real
90x54 card (the mockup's cards were 1.36 aspect, not 1.667, so the left and
right art keep a uniform scale and only the empty cream between them is
stretched). Everything readable on the card is live text, set here, so it
prints sharp rather than at the mockup's resolution.

    python3 make_card2.py     # writes ../business-card.html
"""
import base64
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ART  = os.path.join(HERE, 'card2-art')

PAGE_W, PAGE_H = 96.0, 60.0          # 90x54 trim + 3mm bleed on every edge

# --- The logo is NOT ours to recolour. --------------------------------------
# Aaron's standing instruction: the Jeevo mark ships in its own colours on
# every surface. The reference mockup drew it in red; it is restored here to
# the real orange. If a background does not suit the mark, the background
# changes, never the mark.
LOGO_LOCK = {'#CE7A2E', '#D8830B', '#F5A623', '#FFFFFF'}

# --- ink. Every value measured against the cream before it was adopted. -----
CREAM = '#F8EFE1'
INK   = '#33231A'     # the name and each row's main line   13.20:1
SUB   = '#B54C22'     # the city lines under a number        4.58:1
ICON  = '#CB4D0C'     # the icon discs, sampled off the reference
RULE  = '#B87B32'     # the hairline under the name          3.11:1

ROWS = [
    ('phone', '+91 88004 92691',               'Gurugram, India',     24.5),
    ('phone', '+61 493 574 631',               'Brisbane, Australia', 32.0),
    ('mail',  'jeevotoursandtravels@gmail.com', '',                   39.5),
    ('web',   'jeevo.co.in',                    '',                   45.0),
    ('pin',   'Gurugram, India',                '',                   50.5),
]

GLYPH = {
 'phone': '<path d="M6.1 3.6c.5-.5 1.4-.4 1.8.2l1.1 1.6c.3.5.2 1.2-.2 1.6l-.8.7c.6 1.4 1.7 2.5 '
          '3.1 3.1l.7-.8c.4-.4 1.1-.5 1.6-.2l1.6 1.1c.6.4.7 1.3.2 1.8l-.8.8c-.6.6-1.4.8-2.1.6'
          'C8.6 13 5 9.4 4.1 5.5c-.2-.8 0-1.6.6-2.1z" fill="#fff"/>',
 'mail':  '<rect x="3.4" y="5.2" width="13.2" height="9.6" rx="1" fill="none" stroke="#fff" '
          'stroke-width="1.7"/><path d="M3.9 5.8l6.1 4.6 6.1-4.6" fill="none" stroke="#fff" '
          'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
 'web':   '<circle cx="10" cy="10" r="6.4" fill="none" stroke="#fff" stroke-width="1.6"/>'
          '<ellipse cx="10" cy="10" rx="2.7" ry="6.4" fill="none" stroke="#fff" stroke-width="1.5"/>'
          '<path d="M3.8 7.7h12.4M3.8 12.3h12.4" stroke="#fff" stroke-width="1.5"/>',
 'pin':   '<path d="M10 2.9c-3 0-5.4 2.4-5.4 5.4 0 3.9 5.4 8.8 5.4 8.8s5.4-4.9 5.4-8.8c0-3-2.4-5.4'
          '-5.4-5.4zm0 7.5a2.2 2.2 0 110-4.4 2.2 2.2 0 010 4.4z" fill="#fff"/>',
}


def load_logo():
    svg = open(os.path.join(HERE, 'logo.svg')).read().strip()
    found = {c.upper() for c in re.findall(r'#[0-9A-Fa-f]{6}', svg)}
    if found != LOGO_LOCK:
        raise SystemExit(
            'logo.svg has been recoloured - refusing to build.\n'
            '  expected: %s\n  found:    %s' % (sorted(LOGO_LOCK), sorted(found)))
    return svg


def b64(name):
    with open(os.path.join(ART, name), 'rb') as fh:
        return 'data:image/png;base64,' + base64.b64encode(fh.read()).decode()


def rows_html():
    out = []
    for kind, main, sub, top in ROWS:
        ic = ('<svg class="ic" viewBox="0 0 20 20"><circle cx="10" cy="10" r="10" fill="%s"/>%s</svg>'
              % (ICON, GLYPH[kind]))
        tx = '<span class="main">%s</span>' % main
        if sub:
            tx += '<span class="sub">%s</span>' % sub
        out.append('<div class="row" style="top:%.2fmm">%s<span class="tx">%s</span></div>'
                   % (top, ic, tx))
    return '\n    '.join(out)


HTML = '''<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Jeevo Tours and Travels &mdash; business card</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600&family=Mukta:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  @page { size: __PW__mm __PH__mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #ffffff; }

  .card { position: relative; width: __PW__mm; height: __PH__mm; overflow: hidden;
          page-break-after: always; break-after: page; }
  .card:last-child { page-break-after: auto; break-after: auto; }

  /* ---------------- front ---------------- */
  .front { background: __CREAM__; }
  /* the reference front is plain stock, so it is rebuilt rather than scanned -
     that keeps the mark and the tagline at full vector sharpness */
  /* sized and placed off the reference: the mark runs about two thirds of the
     card's width and the tagline tucks in directly beneath it, not floating */
  .f-logo { position: absolute; left: 50%; top: 28mm; transform: translate(-50%, -50%);
            width: 60mm; }
  .f-logo svg { width: 100%; height: auto; display: block; }
  .f-tag  { position: absolute; left: 50%; top: 37.4mm; transform: translateX(-50%);
            font-family: 'Playfair Display', serif; font-weight: 400; font-size: 9.4pt;
            letter-spacing: .012em; color: __INK__; white-space: nowrap; }

  /* ---------------- back ---------------- */
  .back { background: url("__BACK__") no-repeat 0 0 / __PW__mm __PH__mm; }
  .b-name { position: absolute; left: 19mm; top: 11.4mm;
            font-family: 'Playfair Display', serif; font-weight: 500; font-size: 15pt;
            line-height: 1; color: __INK__; letter-spacing: .01em; }
  .b-rule { position: absolute; left: 19mm; top: 20.6mm; width: 40mm; height: .22mm;
            background: __RULE__; opacity: .85; }
  .b-rule::after { content: ""; position: absolute; left: 23.6mm; top: -.62mm;
            width: 1.45mm; height: 1.45mm; background: __RULE__;
            transform: rotate(45deg); border-radius: .1mm; }

  .row  { position: absolute; left: 19mm; display: flex; align-items: flex-start; gap: 2.3mm; }
  .ic   { flex: none; width: 5mm; height: 5mm; display: block; }
  .tx   { display: flex; flex-direction: column; }
  .main { font-family: 'Mukta', sans-serif; font-weight: 500; font-size: 7pt;
          line-height: 5mm; color: __INK__; letter-spacing: .006em; }
  .sub  { font-family: 'Mukta', sans-serif; font-weight: 400; font-size: 6.2pt;
          line-height: 1.05; color: __SUB__; letter-spacing: .03em; margin-top: -.3mm; }

  @media screen {
    body { background: #e9e4dc; padding: 10mm; }
    .card { margin: 0 auto 8mm; box-shadow: 0 6px 22px rgba(0,0,0,.28); }
  }
</style></head>
<body>
  <div class="card front">
    <div class="f-logo">__LOGO__</div>
    <div class="f-tag">Experiential Tours With a Personal Touch</div>
  </div>
  <div class="card back">
    <div class="b-name">Jazz S</div>
    <div class="b-rule"></div>
    __ROWS__
  </div>
</body></html>
'''


def build():
    html = HTML
    for k, v in (('__PW__', '%g' % PAGE_W), ('__PH__', '%g' % PAGE_H),
                 ('__CREAM__', CREAM), ('__INK__', INK), ('__SUB__', SUB),
                 ('__RULE__', RULE), ('__LOGO__', load_logo()),
                 ('__ROWS__', rows_html()), ('__BACK__', b64('back-plate.png'))):
        html = html.replace(k, v)
    out = os.path.join(ROOT, 'business-card.html')
    with open(out, 'w') as fh:
        fh.write(html)
    print('wrote %s (%.1f KB)' % (out, len(html) / 1024.0))


if __name__ == '__main__':
    build()
