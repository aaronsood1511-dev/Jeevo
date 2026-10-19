# Jeevo business card — design spec
19 Oct 2026

## Decisions (from Aaron)
- Name on card: **Jazz S**, no title
- QR code: yes, to `https://jeevo.co.in`
- Socials: Instagram `jeevotoursandtravels`. **Facebook omitted** — no page URL exists
  in the site code (every Facebook link is a dead `href="#"`) and a web search found no
  page. Printing a guessed URL is unrecoverable, so it is left off until Aaron supplies it.
- Canva is not connected to this session. Output is a print-ready vector PDF instead,
  which any printer accepts and which imports into Canva if wanted.

## Format
- Trim **89 × 54 mm** (Indian / international standard, not US 3.5×2in)
- 3 mm bleed, no crop-mark zone → page **95 × 60 mm**, artwork edge to edge
- Safe area 6 mm inside trim; nothing live outside it
- Two pages: front, back. Vector PDF, fonts embedded.

## Front (deep brown `#4A2410`)
Logo top-left, tagline beneath in letterspaced small caps, saffron hairline,
then name bottom-left and the contact block bottom-right.

Contrast measured against the brown, not eyeballed. The original cream-card
colours fail on it: the deep-green name is **1.10:1 (invisible)** and the logo's
own brown is 4.16:1. Recoloured — logo word and swoosh to saffron (6.35:1),
name to white (13.32:1), tagline to saffron, contacts to cream (12.8:1),
sub-line left in gold (5.13:1). All pass 4.5:1 for small text.

## Back (deep green `#0C3D1C`)
Faint jaali. QR on a white tile for scan reliability, "Plan your trip with Arjun"
beside it, then Instagram handle and the Gurugram office address.

## Verification
- QR generated with macOS CoreImage at error-correction H (30%), then decoded back
  to confirm it resolves to the right URL before it goes on the card.
- Rendered PDF checked for page count and page dimensions.
