/**
 * Composite Cedula Detection & Splitting
 *
 * Detects images containing both sides of a Chilean ID card (front + back
 * stacked vertically) and splits them into separate card images with AI verification.
 *
 * Pure function: buffer in, result out. No DB/S3 side effects.
 */

import sharp from 'sharp'
import { Doc2Fields } from './ocr'
import type { CompositeCedulaResult, ModelArg } from './types'

const ASPECT_RATIO_THRESHOLD = 1.2

/**
 * Core gap-finding engine. Given per-row predicates,
 * finds interior gaps and returns tight crop regions for front and back cards.
 */
function findBestSplit(
  data: Buffer,
  info: { width: number; height: number },
  isGapRow: (y: number) => boolean,
  isContentRow: (y: number) => boolean,
): {
  front: { left: number; top: number; width: number; height: number }
  back: { left: number; top: number; width: number; height: number }
} | null {
  const MIN_GAP_ROWS = Math.max(10, Math.round(info.height * 0.02))
  const gaps: Array<{ start: number; end: number; size: number }> = []
  let gs = -1

  for (let y = 0; y < info.height; y++) {
    if (isGapRow(y)) { if (gs < 0) gs = y }
    else if (gs >= 0) {
      const size = y - gs
      if (size >= MIN_GAP_ROWS) gaps.push({ start: gs, end: y - 1, size })
      gs = -1
    }
  }
  if (gaps.length === 0) return null

  let contentStart = -1, contentEnd = -1
  for (let y = 0; y < info.height; y++) if (isContentRow(y)) { contentStart = y; break }
  for (let y = info.height - 1; y >= 0; y--) if (isContentRow(y)) { contentEnd = y; break }
  if (contentStart < 0 || contentEnd < 0) return null

  const interior = gaps.filter(g => g.start > contentStart && g.end < contentEnd)
  if (interior.length === 0) return null

  const mainGap = interior.reduce((best, g) => {
    const count = (from: number, to: number) => {
      let n = 0; for (let y = from; y <= to; y++) if (isContentRow(y)) n++; return n
    }
    const gImbalance = Math.abs(count(contentStart, g.start - 1) - count(g.end + 1, contentEnd))
    const bestImbalance = Math.abs(count(contentStart, best.start - 1) - count(best.end + 1, contentEnd))
    return gImbalance < bestImbalance ? g : best
  }, interior[0])

  let frontTop = -1
  for (let y = 0; y < mainGap.start; y++) if (isContentRow(y)) { frontTop = y; break }
  if (frontTop < 0) return null

  let frontBottom = mainGap.start - 1
  for (let y = frontBottom; y > frontTop; y--) if (isContentRow(y)) { frontBottom = y; break }

  let backTop = -1
  for (let y = mainGap.end + 1; y < info.height; y++) if (isContentRow(y)) { backTop = y; break }
  if (backTop < 0) return null

  let backBottom = info.height - 1
  for (let y = info.height - 1; y > backTop; y--) if (isContentRow(y)) { backBottom = y; break }

  const minH = Math.round(info.height * 0.10)
  if (frontBottom - frontTop < minH || backBottom - backTop < minH) return null

  function getColBounds(startRow: number, endRow: number): { left: number; right: number } {
    let left = info.width, right = 0
    for (let x = 0; x < info.width; x++) {
      for (let y = startRow; y <= endRow; y++) {
        if (data[y * info.width + x] < 200) {
          if (x < left) left = x
          if (x > right) right = x
          break
        }
      }
    }
    if (right <= left) return { left: 0, right: info.width - 1 }
    return { left, right }
  }

  const fc = getColBounds(frontTop, frontBottom)
  const bc = getColBounds(backTop, backBottom)
  const PAD = 10

  return {
    front: {
      left: Math.max(0, fc.left - PAD),
      top: Math.max(0, frontTop - PAD),
      width: Math.min(fc.right - fc.left + PAD * 2, info.width - Math.max(0, fc.left - PAD)),
      height: Math.min(frontBottom - frontTop + PAD * 2, info.height - Math.max(0, frontTop - PAD)),
    },
    back: {
      left: Math.max(0, bc.left - PAD),
      top: Math.max(0, backTop - PAD),
      width: Math.min(bc.right - bc.left + PAD * 2, info.width - Math.max(0, bc.left - PAD)),
      height: Math.min(backBottom - backTop + PAD * 2, info.height - Math.max(0, backTop - PAD)),
    },
  }
}

/**
 * Analyze an image to find two card regions separated by a gap.
 * Uses layered detection: brightness-based first, then variance-based fallback.
 */
async function findCardRegions(imageBuffer: Buffer): Promise<{
  front: { left: number; top: number; width: number; height: number }
  back: { left: number; top: number; width: number; height: number }
} | null> {
  const { data, info } = await sharp(imageBuffer)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const rowDarkness: number[] = []
  const rowVariance: number[] = []

  for (let y = 0; y < info.height; y++) {
    let darkPixels = 0, sum = 0
    for (let x = 0; x < info.width; x++) {
      const v = data[y * info.width + x]
      if (v < 200) darkPixels++
      sum += v
    }
    const mean = sum / info.width
    let varSum = 0
    for (let x = 0; x < info.width; x++) {
      const diff = data[y * info.width + x] - mean
      varSum += diff * diff
    }
    rowDarkness.push(darkPixels / info.width)
    rowVariance.push(varSum / info.width)
  }

  const DARK_ROW_THRESHOLD = 0.05
  const brightnessResult = findBestSplit(
    data, info,
    (y) => rowDarkness[y] <= DARK_ROW_THRESHOLD,
    (y) => rowDarkness[y] > DARK_ROW_THRESHOLD,
  )
  if (brightnessResult) return brightnessResult

  const sorted = [...rowVariance].sort((a, b) => a - b)
  const medianVariance = sorted[Math.floor(sorted.length / 2)]
  const varianceThreshold = medianVariance * 0.15

  return findBestSplit(
    data, info,
    (y) => rowVariance[y] <= varianceThreshold,
    (y) => rowVariance[y] > varianceThreshold,
  )
}

/**
 * Detect if an image buffer contains a composite cedula (front + back stacked
 * vertically) and split it into two separate card images with AI verification.
 *
 * Pure function: buffer in, result out. No DB/S3 side effects.
 * Callers must convert PDF pages to images before calling this.
 *
 * @returns CompositeCedulaResult if composite cedula detected, null otherwise
 */
export async function detectAndSplitCompositeCedula(
  imageBuffer: Buffer,
  mimetype: string,
  model: ModelArg = 'gemini'
): Promise<CompositeCedulaResult | null> {
  const metadata = await sharp(imageBuffer).metadata()
  const imgWidth = metadata.width || 0
  const imgHeight = metadata.height || 0
  const aspectRatio = imgHeight / (imgWidth || 1)

  if (!(aspectRatio > ASPECT_RATIO_THRESHOLD && imgWidth > 0 && imgHeight > 0)) {
    return null
  }

  const regions = await findCardRegions(imageBuffer).catch(() => null)

  let frontBuf: Buffer
  let backBuf: Buffer

  if (regions) {
    frontBuf = await sharp(imageBuffer).extract(regions.front).toBuffer()
    backBuf = await sharp(imageBuffer).extract(regions.back).toBuffer()
  } else {
    const halfHeight = Math.round(imgHeight / 2)
    frontBuf = await sharp(imageBuffer).extract({ left: 0, top: 0, width: imgWidth, height: halfHeight }).toBuffer()
    backBuf = await sharp(imageBuffer).extract({ left: 0, top: halfHeight, width: imgWidth, height: imgHeight - halfHeight }).toBuffer()
  }

  const frontOcr = await Doc2Fields(frontBuf, mimetype, model)
  const frontDoc = frontOcr?.documents?.[0]

  if (frontDoc?.doc_type_id !== 'cedula-identidad') {
    return null
  }

  // Force doctype since we already confirmed it's a cedula from the front side.
  // Without this, the back half (QR, fingerprint, MRZ) often fails classification.
  const backOcr = await Doc2Fields(backBuf, mimetype, model, 'cedula-identidad')
  const backDoc = backOcr?.documents?.[0]

  const rawBackData = backDoc?.data as Record<string, any> || {}
  const backData: Record<string, any> = {}
  if (rawBackData.lugar_nacimiento) backData.lugar_nacimiento = rawBackData.lugar_nacimiento
  if (rawBackData.profesion) backData.profesion = rawBackData.profesion

  return {
    parts: [
      {
        partId: 'front',
        buffer: frontBuf,
        aiFields: JSON.stringify(frontDoc.data || {}),
        aiDate: frontDoc.docdate ? new Date(`${frontDoc.docdate}T12:00:00`) : null,
        docdate: frontDoc.docdate || null,
      },
      {
        partId: 'back',
        buffer: backBuf,
        aiFields: JSON.stringify(backData),
        aiDate: backDoc?.docdate ? new Date(`${backDoc.docdate}T12:00:00`) : null,
        docdate: backDoc?.docdate || frontDoc.docdate || null,
      },
    ],
  }
}
