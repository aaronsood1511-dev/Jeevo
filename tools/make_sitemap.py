#!/usr/bin/env python3
"""Writes sitemap.xml + robots.txt from whatever pages exist.

Cloudflare 307s /x.html to /x, so every URL here is the extensionless form -
the one Google should keep. Re-run after adding or removing a page.
"""
import os, io, datetime, html

ROOT = os.path.expanduser('~/Desktop/jeevo-tours')
SITE = 'https://jeevo.co.in'

# homepage first, then the itineraries (the pages worth finding), then legal
TOP   = ['index.html']
TOURS = sorted('tours/' + f for f in os.listdir(os.path.join(ROOT, 'tours'))
               if f.endswith('.html'))
LEGAL = ['privacy.html', 'terms.html', 'disclaimer.html', 'photo-credits.html']

# left out on purpose - these are print/internal artefacts, not pages to rank
SKIP  = {'business-card.html', 'brochure.html', 'quotation-letterhead.html'}

def url(rel):
    return SITE + '/' if rel == 'index.html' else SITE + '/' + rel[:-5]

def mtime(rel):
    p = os.path.join(ROOT, rel)
    return datetime.date.fromtimestamp(os.path.getmtime(p)).isoformat()

rows = []
for rel, pri, freq in ([(r, '1.0', 'weekly') for r in TOP] +
                       [(r, '0.8', 'monthly') for r in TOURS] +
                       [(r, '0.3', 'yearly') for r in LEGAL]):
    if os.path.basename(rel) in SKIP: continue
    if not os.path.exists(os.path.join(ROOT, rel)): continue
    rows.append(f'  <url>\n    <loc>{html.escape(url(rel))}</loc>\n'
                f'    <lastmod>{mtime(rel)}</lastmod>\n'
                f'    <changefreq>{freq}</changefreq>\n'
                f'    <priority>{pri}</priority>\n  </url>')

xml = ('<?xml version="1.0" encoding="UTF-8"?>\n'
       '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
       + '\n'.join(rows) + '\n</urlset>\n')
io.open(os.path.join(ROOT, 'sitemap.xml'), 'w', encoding='utf-8').write(xml)

robots = f"""User-agent: *
Allow: /

# print/internal artefacts, not pages anyone should land on from a search
Disallow: /business-card
Disallow: /brochure
Disallow: /quotation-letterhead

Sitemap: {SITE}/sitemap.xml
"""
io.open(os.path.join(ROOT, 'robots.txt'), 'w', encoding='utf-8').write(robots)
print(f'sitemap.xml: {len(rows)} urls\nrobots.txt: written')
