/**
 * V2 Card Detection — Gemini Bounding Box (Front Only)
 *
 * Uses Gemini vision to find and crop the FRONT card from an image.
 * Returns cropped card buffer for the caller to pass to face extraction.
 *
 * This was the first AI-based card detection approach, proving that
 * vision models reliably locate cards regardless of background, angle,
 * or lighting. However it only finds the front card (for face extraction).
 *
 * Extended by: cedulasplit.ts (V3) — same AI bbox approach but finds
 * BOTH front and back cards for composite splitting.
 * See also: cedula.ts (V1, pixel heuristics — superseded).
 */

import sharp from 'sharp'
import { getLogger } from './config'

// Lazy-loaded Gemini client
let geminiClient: any = null
const getGemini = async () => {
    if (!geminiClient) {
        const { GoogleGenAI } = await import('@google/genai')
        geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' })
    }
    return geminiClient
}

// Rate-limit cooldown (independent timer from ocr.ts extractFaceWithGemini)
let cooldownUntil = 0

interface BBox {
    x: number
    y: number
    width: number
    height: number
}

export async function cropCardWithGemini(imageBuffer: Buffer): Promise<Buffer | null> {
    if (!process.env.GEMINI_API_KEY) return null
    if (Date.now() < cooldownUntil) return null

    try {
        const metadata = await sharp(imageBuffer).metadata()
        if (!metadata.width || !metadata.height) return null

        const cardBbox = await findCard(imageBuffer)
        if (!cardBbox) return null

        const cardBuffer = await cropRegion(imageBuffer, cardBbox, metadata.width, metadata.height)
        return cardBuffer
    } catch (err: any) {
        if (err?.status === 429 || err?.httpErrorCode === 429 || err?.message?.includes('429') || err?.message?.includes('RESOURCE_EXHAUSTED')) {
            cooldownUntil = Date.now() + 60_000
        }
        getLogger().error(err, { module: 'face-extract-v2', action: 'cropCard' })
        return null
    }
}

async function findCard(imageBuffer: Buffer): Promise<BBox | null> {
    const base64 = imageBuffer.toString('base64')
    const gemini = await getGemini()

    const prompt = `Find the FRONT side of a Chilean ID card (cédula de identidad) in this image.

The FRONT side has a passport-style photo on the left. The BACK side has text only, no photo.

If the image contains both front and back (composite scan), locate ONLY the front side.
If only one card is visible, determine if it's the front (has photo) or back (no photo).

Return JSON with the front card's location as PERCENTAGES (0-100) of the FULL IMAGE:

{"card": {"x": 5, "y": 10, "width": 90, "height": 40}}

- "x" = percentage from LEFT edge of image to left edge of card
- "y" = percentage from TOP edge of image to top edge of card
- "width" = card width as percentage of image width
- "height" = card height as percentage of image height
- If no front side cédula is visible, return {"card": null}
- Return ONLY valid JSON, no markdown.`

    const result = await gemini.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: {
            parts: [
                { text: prompt },
                { inlineData: { mimeType: 'image/jpeg', data: base64 } },
            ],
        },
    })

    const text = result.text || ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0])
    if (!parsed.card) return null

    const c = parsed.card
    if (typeof c.x !== 'number' || typeof c.y !== 'number' ||
        typeof c.width !== 'number' || typeof c.height !== 'number') return null

    return c as BBox
}

async function cropRegion(
    buffer: Buffer,
    bbox: BBox,
    imgW: number,
    imgH: number
): Promise<Buffer | null> {
    const { x, y, width: bw, height: bh } = bbox

    if (x < 0 || y < 0 || bw <= 0 || bh <= 0) return null
    if (x + bw > 110 || y + bh > 110) return null

    const pad = 2
    const px = Math.max(0, x - pad)
    const py = Math.max(0, y - pad)
    const pw = Math.min(bw + pad * 2, 100 - px)
    const ph = Math.min(bh + pad * 2, 100 - py)

    const left = Math.max(0, Math.round((px / 100) * imgW))
    const top = Math.max(0, Math.round((py / 100) * imgH))
    const width = Math.min(Math.round((pw / 100) * imgW), imgW - left)
    const height = Math.min(Math.round((ph / 100) * imgH), imgH - top)

    if (width <= 10 || height <= 10) return null

    return sharp(buffer)
        .extract({ left, top, width, height })
        .toBuffer()
}
