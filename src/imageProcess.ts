import { ImageAdjustments } from './types'

/**
 * Apply all camera-style adjustments to a source image via Canvas,
 * return a data URL of the processed result.
 */
export async function processImage(
  src: string,
  adj: ImageAdjustments,
): Promise<string> {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  await new Promise<void>((res, rej) => {
    img.onload = () => res()
    img.onerror = () => rej(new Error('Image load failed'))
    img.src = src
  })

  const maxSide = 1024
  let w = img.naturalWidth
  let h = img.naturalHeight
  if (w > maxSide || h > maxSide) {
    const s = maxSide / Math.max(w, h)
    w = Math.round(w * s)
    h = Math.round(h * s)
  }

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, w, h)

  let imageData = ctx.getImageData(0, 0, w, h)
  let d = imageData.data

  // ---- pixel-level adjustments ----
  const b = adj.brightness / 100
  const exp = Math.pow(2, adj.exposure / 50)
  const c = (adj.contrast + 100) / 100
  const cOffset = 128 * (1 - c)
  const sat = (adj.saturation + 100) / 100
  const hi = adj.highlights / 100
  const sh = adj.shadows / 100
  const temp = adj.temperature / 200
  const tint = adj.tint / 200

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i]! / 255
    let g = d[i + 1]! / 255
    let b_ = d[i + 2]! / 255

    // exposure
    r *= exp; g *= exp; b_ *= exp

    // temperature (warm/cool)
    r += temp * 0.15
    b_ -= temp * 0.15

    // tint (green/magenta)
    g += tint * 0.1
    r -= tint * 0.05
    b_ -= tint * 0.05

    // brightness
    r += b; g += b; b_ += b

    // highlights / shadows tone curve
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b_
    if (lum > 0.5) {
      const t = (lum - 0.5) * 2
      const boost = hi * t
      r += boost * r; g += boost * g; b_ += boost * b_
    } else {
      const t = (0.5 - lum) * 2
      const boost = sh * t
      r += boost * r * 0.5; g += boost * g * 0.5; b_ += boost * b_ * 0.5
    }

    // contrast
    r = r * c + cOffset / 255
    g = g * c + cOffset / 255
    b_ = b_ * c + cOffset / 255

    // saturation
    const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b_
    r = gray + (r - gray) * sat
    g = gray + (g - gray) * sat
    b_ = gray + (b_ - gray) * sat

    d[i] = Math.min(255, Math.max(0, r * 255))
    d[i + 1] = Math.min(255, Math.max(0, g * 255))
    d[i + 2] = Math.min(255, Math.max(0, b_ * 255))
  }

  ctx.putImageData(imageData, 0, 0)

  // ---- sharpness (unsharp mask-ish convolution) ----
  if (adj.sharpness > 0) {
    const amt = adj.sharpness / 150
    imageData = ctx.getImageData(0, 0, w, h)
    d = imageData.data
    const blurred = new Uint8ClampedArray(d)
    // simple 3x3 box blur → sharpen
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        for (let ch = 0; ch < 3; ch++) {
          let sum = 0
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              sum += d[((y + dy) * w + (x + dx)) * 4 + ch]!
            }
          }
          const avg = sum / 9
          const idx = (y * w + x) * 4 + ch
          blurred[idx] = Math.min(255, Math.max(0, d[idx]! * (1 + amt) - avg * amt))
        }
      }
    }
    for (let i = 0; i < d.length; i += 4) {
      d[i] = blurred[i]!
      d[i + 1] = blurred[i + 1]!
      d[i + 2] = blurred[i + 2]!
    }
    ctx.putImageData(imageData, 0, 0)
  }

  // ---- vignette ----
  if (adj.vignette > 0) {
    const vg = ctx.createRadialGradient(w/2, h/2, Math.min(w,h)*0.15, w/2, h/2, Math.max(w,h)*0.7)
    vg.addColorStop(0, 'rgba(0,0,0,0)')
    vg.addColorStop(1, `rgba(0,0,0,${adj.vignette/200})`)
    ctx.fillStyle = vg
    ctx.fillRect(0, 0, w, h)
  }

  // ---- film grain ----
  if (adj.grain > 0) {
    imageData = ctx.getImageData(0, 0, w, h)
    d = imageData.data
    const amt = adj.grain * 0.5
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * amt
      d[i] = Math.min(255, Math.max(0, d[i]! + n))
      d[i + 1] = Math.min(255, Math.max(0, d[i + 1]! + n))
      d[i + 2] = Math.min(255, Math.max(0, d[i + 2]! + n))
    }
    ctx.putImageData(imageData, 0, 0)
  }

  return canvas.toDataURL('image/png')
}
