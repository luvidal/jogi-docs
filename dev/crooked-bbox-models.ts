/**
 * Crooked diagnosis — compare V3 BBOX prompt across Gemini models on the
 * recovered Shirley page image. Output is metadata-only: each returned bbox
 * is reduced to {has_front, front_oob, has_back, back_oob} so that nothing
 * about the underlying card content (face, name, RUT, MRZ) can leak.
 *
 * "oob" = at least one coordinate or sum violates V3's isValidBox bound
 * (x|y >= -5, x+w | y+h <= 110, w|h > 0).
 */

import * as fs from 'fs'
import { GoogleGenAI } from '@google/genai'

const PARENT_PNG = '/Users/avd/Downloads/crooked/shirley-codeudor/CODEUDOR-SHIRLEY-v3-input-20260421.png'

// Verbatim copy of BBOX_PROMPT from src/cedulasplit.ts:46-65.
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

interface BBox { x: number; y: number; width: number; height: number }

function oob(b: BBox | null | undefined): boolean {
    if (!b) return true
    if (typeof b.x !== 'number' || typeof b.y !== 'number' || typeof b.width !== 'number' || typeof b.height !== 'number') return true
    if (b.width <= 0 || b.height <= 0) return true
    if (b.x < -5 || b.y < -5) return true
    if (b.x + b.width > 110) return true
    if (b.y + b.height > 110) return true
    return false
}

function describe(b: BBox | null | undefined, label: string): string {
    if (!b) return `${label}=null`
    return `${label}={x:${b.x}, y:${b.y}, w:${b.width}, h:${b.height}, sum_x:${b.x + b.width}, sum_y:${b.y + b.height}, oob:${oob(b)}}`
}

async function main() {
    const buf = fs.readFileSync(PARENT_PNG)
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
    const base64 = buf.toString('base64')
    for (const model of ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro']) {
        const t = Date.now()
        const r = await ai.models.generateContent({
            model,
            contents: [{ role: 'user', parts: [{ text: BBOX_PROMPT }, { inlineData: { mimeType: 'image/png', data: base64 } }] }],
            config: { temperature: 0, maxOutputTokens: 8192, responseMimeType: 'application/json' },
        })
        const txt: string = (r as any)?.text ?? (r as any)?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? '').join('') ?? ''
        const finish = (r as any)?.candidates?.[0]?.finishReason
        let parsed: any = null
        try { parsed = JSON.parse(txt.match(/\{[\s\S]*\}/)?.[0] ?? '') } catch {}
        const front: BBox | null | undefined = parsed?.front
        const back: BBox | null | undefined = parsed?.back
        console.log(`--- ${model} ${Date.now() - t}ms finishReason=${finish} ---`)
        console.log('  ' + describe(front, 'front'))
        console.log('  ' + describe(back, 'back'))
    }
}

main().catch(err => { console.error('Fatal:', err?.stack ?? err); process.exit(1) })
