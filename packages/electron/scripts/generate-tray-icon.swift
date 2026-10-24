import CoreGraphics
import Foundation
import ImageIO

// Generate a transparent template mark at standard and Retina resolutions.
let resources = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent().deletingLastPathComponent()
    .appendingPathComponent("resources")

for scale in [1, 2] {
    let pixels = 20 * scale
    let context = CGContext(
        data: nil, width: pixels, height: pixels, bitsPerComponent: 8,
        bytesPerRow: pixels * 4, space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    )!
    context.translateBy(x: 0, y: CGFloat(pixels))
    context.scaleBy(x: CGFloat(scale), y: -CGFloat(scale))
    context.setStrokeColor(CGColor(red: 0, green: 0, blue: 0, alpha: 1))
    context.setLineWidth(3.5)
    context.setLineCap(.round)
    context.setLineJoin(.round)
    context.move(to: CGPoint(x: 4, y: 10))
    context.addLine(to: CGPoint(x: 8.5, y: 14.5))
    context.addLine(to: CGPoint(x: 16, y: 5))
    context.strokePath()
    let name = scale == 1 ? "trayTemplate.png" : "trayTemplate@2x.png"
    let destination = CGImageDestinationCreateWithURL(
        resources.appendingPathComponent(name) as CFURL, "public.png" as CFString, 1, nil
    )!
    CGImageDestinationAddImage(destination, context.makeImage()!, nil)
    precondition(CGImageDestinationFinalize(destination), "Could not write \(name)")
}
