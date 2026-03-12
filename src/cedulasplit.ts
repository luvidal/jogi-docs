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
import { model2vision } from './ai'
import { Doc2Fields } from './ocr'
import { getLogger } from './config'
import type { CompositeCedulaResult, ModelArg } from './types'

type AiModel = 'GPT' | 'ANTHROPIC' | 'GEMINI'

const toAiModel = (m: ModelArg): AiModel =>
  m === 'gpt5' ? 'GPT' : m === 'gemini' ? 'GEMINI' : 'ANTHROPIC'

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

const BBOX_PROMPT = `This image may contain both sides of a Chilean ID card (cédula de identidad).

The FRONT side has: a passport-style photo on the left, the person's name, RUT number, birth date, nationality, and issue/expiry dates.
The BACK side has: a QR code, fingerprint, MRZ (machine-readable zone), profession, and birthplace.

If this image contains BOTH the front and back sides (stacked vertically, side by side, or in any arrangement), return their locations as percentage coordinates (0–100) of the full image dimensions.

Return JSON:
{"front": {"x": N, "y": N, "width": N, "height": N}, "back": {"x": N, "y": N, "width": N, "height": N}}

Where:
- "x" = percentage from left edge of image to left edge of card
- "y" = percentage from top edge of image to top edge of card
- "width" = card width as percentage of image width
- "height" = card height as percentage of image height

If this image does NOT contain both sides (only one card, or not a cédula at all), return:
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
  const text = await model2vision(model, mimetype, base64, BBOX_PROMPT)
  if (!text) return null

  const jsonMatch = text.match(/\{[\s\S]*\}/)
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
  } catch (err) {
    getLogger().error(err, { module: 'cedula-split-v3', action: 'findRegions' })
    return null
  }
  if (!regions) return null

  // Step 2: Crop both cards
  const frontBuf = await cropRegion(imageBuffer, regions.front, imgW, imgH)
  const backBuf = await cropRegion(imageBuffer, regions.back, imgW, imgH)
  if (!frontBuf || !backBuf) return null

  // Step 3: Extract fields from front — must classify as cedula
  const frontOcr = await Doc2Fields(frontBuf, mimetype, model)
  const frontDoc = frontOcr?.documents?.[0]
  if (frontDoc?.doc_type_id !== 'cedula-identidad') return null

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
