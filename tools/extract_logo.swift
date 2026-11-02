import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

// Cuts the Jeevo mark out of the supplied mockup (`jeevologo .png`):
//   - drops the grey backdrop and its drop shadow,
//   - un-blends the backdrop out of antialiased edges so the mark carries no
//     grey fringe onto a light background,
//   - repairs the stray red "Text" placeholder that was exported into the
//     artwork, overlapping the "v".
//
// The placeholder could not simply be deleted: it sits ON the v, so removing
// it leaves letter-shaped holes. Filling from the neighbours bled orange into
// the background and deformed the stroke. The v is a flat solid wedge whose
// edges move linearly, so the damaged rows are instead REBUILT from the clean
// rows above and below - measured, not guessed:
//     y=265  orange spans x 827..866
//     y=284  orange spans x 834..859
//
//   swiftc -O extract_logo.swift -o extract_logo
//   ./extract_logo "<in.png>" <out.png> [scale]

let inPath  = CommandLine.arguments[1]
let outPath = CommandLine.arguments[2]
let scale   = CommandLine.arguments.count > 3 ? Int(CommandLine.arguments[3])! : 1

let INK = (r: 206.0, g: 122.0, b: 46.0)        // #CE7A2E, the wordmark orange

// the damaged band, and the v's measured edges either side of it
let BAND   = (y0: 266, y1: 283)
let TOP    = (y: 265, left: 827.0, right: 866.0)
let BOTTOM = (y: 284, left: 834.0, right: 859.0)
let BANDX  = (x0: 812, x1: 882)

guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: inPath) as CFURL, nil),
      let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else { exit(1) }
let W = img.width, H = img.height
var b = [UInt8](repeating: 0, count: W*H*4)
let ctx = CGContext(data: &b, width: W, height: H, bitsPerComponent: 8, bytesPerRow: W*4,
                    space: CGColorSpaceCreateDeviceRGB(),
                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.draw(img, in: CGRect(x: 0, y: 0, width: W, height: H))

// backdrop, averaged from a corner the mark never reaches
var bg = [0.0, 0.0, 0.0]
var nbg = 0
for y in 4..<40 { for x in 4..<40 {
    let o = (y*W+x)*4
    for k in 0..<3 { bg[k] += Double(b[o+k]) }
    nbg += 1
} }
for k in 0..<3 { bg[k] /= Double(nbg) }

var out = [UInt8](repeating: 0, count: W*H*4)

for y in 0..<H {
    // where the v's edges fall on this row, if it is one of the damaged ones
    var lx = 0.0, rx = -1.0
    if y >= BAND.y0 && y < BAND.y1 {
        let t = Double(y - TOP.y) / Double(BOTTOM.y - TOP.y)
        lx = TOP.left  + (BOTTOM.left  - TOP.left)  * t
        rx = TOP.right + (BOTTOM.right - TOP.right) * t
    }
    for x in 0..<W {
        let o = (y*W+x)*4

        // --- rebuilt band: the wedge, with a soft edge, and nothing outside it
        if rx > 0 && x >= BANDX.x0 && x < BANDX.x1 {
            let dx = Double(x)
            var a = 0.0
            if dx >= lx - 1 && dx <= rx + 1 {
                a = min(min(dx - (lx - 1), (rx + 1) - dx), 1.0)
                a = min(max(a, 0.0), 1.0)
            }
            if a > 0 {
                out[o]   = UInt8(INK.r); out[o+1] = UInt8(INK.g)
                out[o+2] = UInt8(INK.b); out[o+3] = UInt8(a * 255)
            }
            continue
        }

        let r = Double(b[o]), g = Double(b[o+1]), bl = Double(b[o+2])
        let mx = max(r, max(g, bl)), mn = min(r, min(g, bl))
        let sat = mx - mn

        // Faint pink remnants of the placeholder survive just outside the
        // rebuilt band. Nothing in the mark looks like this: its green sits at
        // least 76 above its blue (#CE7A2E), 131 for the globe (#F5A623).
        if sat > 20 && (g - bl) < 25 && r > g + 30 { continue }
        let lum = (r*299 + g*587 + bl*114)/1000

        // keep saturated ink and anything clearly brighter than the backdrop
        // (the white globe lines); ramp rather than threshold so edges stay smooth
        let satA = min(max((sat - 26) / 38, 0), 1)
        let lumA = min(max((lum - 152) / 46, 0), 1)
        let a = max(satA, lumA)
        if a <= 0.06 { continue }

        for k in 0..<3 {
            let obs = Double(b[o+k])
            // obs = a*true + (1-a)*bg -> recover true. Dividing by a tiny alpha
            // amplifies noise into white speckle, so below 0.2 the observed
            // colour is used as-is; at that opacity the difference is invisible.
            let t = (a >= 0.2 && a < 0.999) ? (obs - (1 - a) * bg[k]) / a : obs
            out[o+k] = UInt8(min(255, max(0, t)))
        }
        out[o+3] = UInt8(a * 255)
    }
}

for i in stride(from: 0, to: out.count, by: 4) {
    let a = Double(out[i+3]) / 255
    for k in 0..<3 { out[i+k] = UInt8(Double(out[i+k]) * a) }
}
let cut = CGContext(data: &out, width: W, height: H, bitsPerComponent: 8, bytesPerRow: W*4,
                    space: CGColorSpaceCreateDeviceRGB(),
                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
var final = cut.makeImage()!

if scale > 1 {
    let OW = W*scale, OH = H*scale
    let up = CGContext(data: nil, width: OW, height: OH, bitsPerComponent: 8, bytesPerRow: 0,
                       space: CGColorSpaceCreateDeviceRGB(),
                       bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    up.interpolationQuality = .high
    up.draw(final, in: CGRect(x: 0, y: 0, width: OW, height: OH))
    final = up.makeImage()!
}

let dst = CGImageDestinationCreateWithURL(URL(fileURLWithPath: outPath) as CFURL,
                                          UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(dst, final, nil)
CGImageDestinationFinalize(dst)
print(String(format: "  %@  %dx%d   backdrop was #%02X%02X%02X",
             (outPath as NSString).lastPathComponent, final.width, final.height,
             Int(bg[0]), Int(bg[1]), Int(bg[2])))
