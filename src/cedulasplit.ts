/**
 * V3 Composite Cedula Detection — AI Bounding Boxes
 *
 * Sends the full image to an AI vision model and asks it to locate
 * both the front and back cards as percentage-based bounding boxes.
 * Crops with sharp, then runs Doc2Fields for field extraction.
 *
 * Replaces V1 (cedula.ts) which used pixel-level row heuristics
 * (brightness/variance gap-finding) that broke on dark backgrounds,
 * angled photos, shadows, overlapping cards, and non-standard layouts.
 *
 * Inspired by V2 (faceextract.ts) which proved AI bounding boxes work
 * for locating the front card. V3 extends that to both cards.
 *
 * Key differences from V1:
 *  - No aspect ratio gate — the AI decides if the image is composite
 *  - No pixel heuristics — no findBestSplit, no brightness/variance
 *  - No 50/50 fallback — if AI can't find two cards, returns null
 *  - Uses model2vision() from ai.ts (multi-model fallback + retry)
 *
 * Pure function: buffer in, result out. No DB/S3 side effects.
 */

import sharp from 'sharp'
import { model2vision, toAiModel } from './ai'
import type { AiModel } from './ai'
import { Doc2Fields } from './ocr'
import { extractFace } from './faceextract'
import { getLogger } from './config'
import type { CompositeCedulaResult, ModelArg } from './types'


/** Bounding box as percentages (0–100) of the full image */
interface BBox {
  x: number
  y: number
  width: number
  height: number
}

interface CardRegions {
  front: BBox
  back: BBox
}

const BBOX_PROMPT = `You are looking at a photograph or scan of a Chilean ID card (cédula de identidad). The image likely contains BOTH sides of the card — front and back — in a single image.

How to identify each side:
- FRONT: Has a passport-style PHOTO of a person on the left side, plus text fields: name (APELLIDOS/NOMBRES), RUT number, birth date, nationality, sex, issue/expiry dates, and a signature. The header reads "CÉDULA DE IDENTIDAD" and "REPÚBLICA DE CHILE".
- BACK: Has a QR code (top-left), a fingerprint (right side), MRZ machine-readable lines at the bottom (starts with INCHL...), and text fields: birthplace (Nació en), profession (Profesión).

Common layouts: cards stacked vertically (front on top, back below), side by side, or at slight angles. There is usually a visible gap or background between the two cards.

Return the bounding box of EACH side as percentage coordinates (0–100) of the full image:
{"front": {"x": N, "y": N, "width": N, "height": N}, "back": {"x": N, "y": N, "width": N, "height": N}}

Where x/y is the top-left corner of the card as a percentage of image width/height, and width/height is the card's size as a percentage of image dimensions.

Example for vertically stacked cards:
{"front": {"x": 2, "y": 1, "width": 96, "height": 46}, "back": {"x": 2, "y": 52, "width": 96, "height": 46}}

If you can only see ONE side of the card, return:
{"front": null, "back": null}

Return ONLY valid JSON.`

/**
 * Ask AI to locate front and back cards in the image.
 * Returns percentage-based bounding boxes or null.
 */
async function findCardRegionsWithAI(
  imageBuffer: Buffer,
  mimetype: string,
  model: AiModel,
): Promise<CardRegions | null> {
  const base64 = imageBuffer.toString('base64')
  const vr = await model2vision(model, mimetype, base64, BBOX_PROMPT)
  if (!vr.text) return null

  const jsonMatch = vr.text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null

  const parsed = JSON.parse(jsonMatch[0])
  if (!parsed.front || !parsed.back) return null

  const isValidBox = (b: any): b is BBox =>
    b &&
    typeof b.x === 'number' && typeof b.y === 'number' &&
    typeof b.width === 'number' && typeof b.height === 'number' &&
    b.width > 0 && b.height > 0 &&
    b.x >= -5 && b.y >= -5 &&
    b.x + b.width <= 110 && b.y + b.height <= 110

  if (!isValidBox(parsed.front) || !isValidBox(parsed.back)) return null

  return { front: parsed.front, back: parsed.back }
}

/**
 * Crop a region from an image using percentage-based coordinates.
 * Adds padding and clamps to image bounds.
 */
async function cropRegion(
  buffer: Buffer,
  bbox: BBox,
  imgW: number,
  imgH: number,
): Promise<Buffer | null> {
  const PAD = 2

  const px = Math.max(0, bbox.x - PAD)
  const py = Math.max(0, bbox.y - PAD)
  const pw = Math.min(bbox.width + PAD * 2, 100 - px)
  const ph = Math.min(bbox.height + PAD * 2, 100 - py)

  const left = Math.max(0, Math.round((px / 100) * imgW))
  const top = Math.max(0, Math.round((py / 100) * imgH))
  const width = Math.min(Math.round((pw / 100) * imgW), imgW - left)
  const height = Math.min(Math.round((ph / 100) * imgH), imgH - top)

  if (width <= 10 || height <= 10) return null

  return sharp(buffer).extract({ left, top, width, height }).toBuffer()
}

/**
 * Detect if an image contains a composite cedula (front + back) and split
 * it into two separate card images with AI-extracted fields.
 *
 * Pure function: buffer in, result out. No DB/S3 side effects.
 * Callers must convert PDF pages to images before calling this.
 *
 * @returns CompositeCedulaResult if composite cedula detected, null otherwise
 */
export async function detectAndSplitCompositeCedulaV3(
  imageBuffer: Buffer,
  mimetype: string,
  model: ModelArg = 'gemini',
): Promise<CompositeCedulaResult | null> {
  const metadata = await sharp(imageBuffer).metadata()
  const imgW = metadata.width || 0
  const imgH = metadata.height || 0
  if (!imgW || !imgH) return null

  // Step 1: Ask AI to locate both cards
  const aiModel = toAiModel(model)
  let regions: CardRegions | null
  try {
    regions = await findCardRegionsWithAI(imageBuffer, mimetype, aiModel)
  } catch (err: any) {
    // Rate-limit / quota errors from the host-provided Gemini gate must bubble
    // up so the upload handler can surface them to the user (429 + ai_busy).
    // Swallowing would let the upload proceed as if no cedula was detected,
    // and the user would never see a toast about why OCR is failing.
    if (err?.status === 429) throw err
    getLogger().error(err, { module: 'cedula-split-v3', action: 'findRegions' })
    return null
  }
  if (!regions) return null

  // Step 2: Crop both cards, then trim whitespace borders.
  // Gemini bboxes often include surrounding whitespace (especially on scans),
  // which breaks downstream face extraction (left 40% becomes mostly blank).
  // sharp.trim() removes uniform-color borders to get a tight card crop.
  let frontBuf = await cropRegion(imageBuffer, regions.front, imgW, imgH)
  let backBuf = await cropRegion(imageBuffer, regions.back, imgW, imgH)
  if (!frontBuf || !backBuf) return null
  // Explicitly trim white borders — trim() auto-detects from top-left pixel,
  // which is often card-colored (blue), not the white background we need to remove.
  // Threshold 80 needed: scan backgrounds are light gray (#E0E0E0),
  // Euclidean distance from #FFF is ~54, so threshold 40 misses them.
  const trimOpts = { background: '#FFFFFF', threshold: 80 }
  try { frontBuf = await sharp(frontBuf).trim(trimOpts).toBuffer() } catch {}
  try { backBuf = await sharp(backBuf).trim(trimOpts).toBuffer() } catch {}

  // Step 3: Extract fields from front — must classify as cedula
  // skipFace: V3 handles face extraction separately via Rekognition
  const frontOcr = await Doc2Fields(frontBuf, mimetype, model, undefined, { skipFace: true })
  const frontDoc = frontOcr?.documents?.[0]
  if (frontDoc?.doc_type_id !== 'cedula-identidad') return null

  // Step 3b: Extract face via Rekognition (picks largest face, ignores ghost hologram)
  const frontData = (frontDoc.data || {}) as Record<string, any>
  delete frontData.foto_bbox
  const faceResult = await extractFace(frontBuf)
  if (faceResult) frontData.foto_base64 = faceResult.face

  // Step 4: Extract fields from back — force doctype since QR/fingerprint/MRZ
  // often fail auto-classification
  const backOcr = await Doc2Fields(backBuf, mimetype, model, 'cedula-identidad')
  const backDoc = backOcr?.documents?.[0]

  const rawBackData = (backDoc?.data as Record<string, any>) || {}
  const backData: Record<string, any> = {}
  if (rawBackData.lugar_nacimiento) backData.lugar_nacimiento = rawBackData.lugar_nacimiento
  if (rawBackData.profesion) backData.profesion = rawBackData.profesion

  return {
    parts: [
      {
        partId: 'front',
        buffer: frontBuf,
        aiFields: JSON.stringify(frontData),
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
