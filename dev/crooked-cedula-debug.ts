/**
 * Crooked diagnosis — instrument V3's first step (BBOX query) to determine
 * WHY V3 returns null on the recovered Shirley page image:
 *   (a) AI returned {"front": null, "back": null}  → AI says "one side only"
 *   (b) AI returned bboxes that failed isValidBox    → satellite validation gap
 *   (c) JSON parse failed / no text                  → AI prompting issue
 *   (d) AI returned valid bboxes but downstream Doc2Fields/face failed
 *
 * Mirrors V3's exact prompt + model + temperature so the response is
 * representative of what production sees.
 */

import * as fs from 'fs'
import * as crypto from 'crypto'
import { GoogleGenAI } from '@google/genai'

const PARENT_PNG = '/Users/avd/Downloads/crooked/shirley-codeudor/CODEUDOR-SHIRLEY-v3-input-20260421.png'

// EXACT prompt from src/cedulasplit.ts:46-65
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

async function main() {
    const buf = fs.readFileSync(PARENT_PNG)
    const sha = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16)
    console.log(`source=${PARENT_PNG}`)
    console.log(`bytes=${buf.length} sha16=${sha}`)

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
    const base64 = buf.toString('base64')

    // Run 3 times to check determinism (V3 doesn't pin seed/topP/candidateCount)
    for (let i = 1; i <= 3; i++) {
        const t = Date.now()
        const r = await ai.models.generateContent({
            model: 'gemini-2.5-flash-lite',
            contents: [{
                role: 'user',
                parts: [
                    { text: BBOX_PROMPT },
                    { inlineData: { mimeType: 'image/png', data: base64 } },
                ],
            }],
            config: {
                temperature: 0,
                maxOutputTokens: 8192,
                responseMimeType: 'application/json',
            },
        })
        const text: string = (r as any)?.text ?? (r as any)?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? '').join('') ?? ''
        const finish = (r as any)?.candidates?.[0]?.finishReason
        console.log(`\n--- attempt ${i} ${Date.now() - t}ms finishReason=${finish} ---`)
        console.log(text)
    }
}

main().catch(err => { console.error('Fatal:', err?.stack ?? err); process.exit(1) })
