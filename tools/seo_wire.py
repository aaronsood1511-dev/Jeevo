#!/usr/bin/env python3
"""Wires the SEO head tags Google needs onto every Jeevo page.

Adds, per page: a canonical URL, Open Graph + Twitter cards pointing at
jeevo.co.in (they pointed at a dead vercel.app), and JSON-LD - TravelAgency
on the homepage, TouristTrip on each itinerary.

Idempotent: re-running replaces the block it wrote rather than stacking it.
Nothing it writes is translatable, so no data-i18n tags are added and the
i18n bundles are untouched.
"""
import io, os, re, sys, html as _html

ROOT = os.path.expanduser('~/Desktop/jeevo-tours')
SITE = 'https://jeevo.co.in'
MARK = 'jeevo-seo'          # the block we own, so we can replace it cleanly

BIZ = {
    'name':   'Jeevo Tours and Travels',
    'phone':  '+91 98100 22651',        # the number the live site uses
    'email':  'jeevotoursandtravels@gmail.com',
    'street': '31 Wellington Estate, DLF Phase 5',
    'city':   'Gurugram', 'region': 'Haryana',
    'post':   '122002',   'country': 'IN',
    'insta':  'https://www.instagram.com/jeevotoursandtravels',
}

def canon_for(rel):
    """Cloudflare 307s /x.html -> /x, so the canonical is the extensionless one."""
    if rel == 'index.html':
        return SITE + '/'
    return SITE + '/' + rel[:-5]        # strip '.html'

def hero_of(src, rel):
    m = re.search(r"url\('?\.\./(assets/img/[^')]+)", src)
    if m:
        return SITE + '/' + m.group(1)
    m = re.search(r"url\('?(assets/img/[^')]+)", src)
    if m:
        return SITE + '/' + m.group(1)
    return SITE + '/assets/img/taj-mahal-1920.webp'

def text_of(src, tag):
    m = re.search(r'<%s[^>]*>(.*?)</%s>' % (tag, tag), src, re.S)
    return m.group(1).strip() if m else ''

def attr_of(src, name):
    m = re.search(r'<meta\s+name="%s"\s+content="([^"]*)"' % name, src)
    return m.group(1) if m else ''

def jsonld(rel, title, desc, img, canon):
    if rel == 'index.html':
        node = {
          "@context": "https://schema.org", "@type": "TravelAgency",
          "name": BIZ['name'],
          # the short forms people actually type, tied to the one business
          "alternateName": ["Jeevo Tours", "Jeevo Travels", "Jeevo"],
          "url": SITE + '/',
          "logo": SITE + "/assets/jeevo-logo.svg",
          "image": img, "description": desc,
          "telephone": BIZ['phone'], "email": BIZ['email'],
          "address": {"@type": "PostalAddress",
                      "streetAddress": BIZ['street'],
                      "addressLocality": BIZ['city'],
                      "addressRegion": BIZ['region'],
                      "postalCode": BIZ['post'],
                      "addressCountry": BIZ['country']},
          "areaServed": "IN",
          "sameAs": [BIZ['insta']],
        }
    elif rel.startswith('tours/'):
        node = {
          "@context": "https://schema.org", "@type": "TouristTrip",
          # the <title> carries a " | Jeevo" suffix for the browser tab;
          # the trip's own name should not
          "name": re.sub(r'\s*\|\s*Jeevo\s*$', '', title),
          "description": desc, "image": img, "url": canon,
          "touristType": "Leisure",
          "provider": {"@type": "TravelAgency", "name": BIZ['name'],
                       "url": SITE + '/'},
        }
    else:
        return None
    import json
    return json.dumps(node, indent=2, ensure_ascii=False)

def block(rel, src):
    title = _html.unescape(re.sub('<[^>]*>', '', text_of(src, 'title')))
    desc  = _html.unescape(attr_of(src, 'description'))
    canon = canon_for(rel)
    img   = hero_of(src, rel)
    L = [f'    <!-- {MARK}:start  generated - see tools/seo_wire.py -->',
         f'    <link rel="canonical" href="{canon}">',
         f'    <meta property="og:url" content="{canon}">']
    if not re.search(r'property="og:type"', src):
        L += [f'    <meta property="og:type" content="website">',
              f'    <meta property="og:site_name" content="Jeevo">',
              f'    <meta property="og:title" content="{_html.escape(title)}">',
              f'    <meta property="og:description" content="{_html.escape(desc)}">']
    L += [f'    <meta property="og:image" content="{img}">',
          f'    <meta name="twitter:card" content="summary_large_image">',
          f'    <meta name="twitter:image" content="{img}">']
    ld = jsonld(rel, title, desc, img, canon)
    if ld:
        L.append('    <script type="application/ld+json">')
        L.append(ld)
        L.append('    </script>')
    L.append(f'    <!-- {MARK}:end -->')
    return '\n'.join(L) + '\n'

def visible(src):
    """Everything a reader sees - used to prove we changed nothing visible."""
    s = re.sub(r'(?is)<script.*?</script>', ' ', src)
    s = re.sub(r'(?is)<style.*?</style>', ' ', s)
    s = re.sub(r'(?is)<head.*?</head>', ' ', s)
    s = re.sub(r'<[^>]+>', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

pages = ['index.html', 'privacy.html', 'terms.html', 'disclaimer.html',
         'photo-credits.html']
pages += sorted('tours/' + f for f in os.listdir(os.path.join(ROOT, 'tours'))
                if f.endswith('.html'))

changed = []
for rel in pages:
    p = os.path.join(ROOT, rel)
    src = io.open(p, encoding='utf-8').read()
    before_vis = visible(src)

    # drop any block we wrote before, so this is idempotent
    src = re.sub(r'[ \t]*<!-- %s:start.*?%s:end -->\n' % (MARK, MARK), '',
                 src, flags=re.S)
    # the dead vercel domain, wherever it appears in a tag
    src = src.replace('https://jeevo-tours.vercel.app', SITE)

    new = block(rel, src)
    m = re.search(r'(<meta\s+name="description"[^>]*>\n)', src)
    if m:
        src = src[:m.end(1)] + new + src[m.end(1):]
    else:                       # no description - sit right after </title>
        m = re.search(r'(</title>\n)', src)
        if not m:
            print('  SKIP (no anchor):', rel); continue
        src = src[:m.end(1)] + new + src[m.end(1):]

    after_vis = visible(src)
    if before_vis != after_vis:
        print('  REFUSED - visible text changed:', rel); sys.exit(1)

    io.open(p, 'w', encoding='utf-8').write(src)
    changed.append(rel)

print('wired %d pages' % len(changed))
