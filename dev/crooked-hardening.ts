/**
 * Crooked hardening — run detectAndSplitCompositeCedulaV3 on three real-world
 * same-page composite cedula fixtures harvested by Agent 1, prints
 * metadata-only output (no PII, no card content) for each:
 *   - sha16 + bytes + dimensions of the input
 *   - raw bbox JSON from step 1 (front + back as {x,y,w,h} %)
 *   - per-part: partId, buffer bytes, post-trim dimensions, docdate present?,
 *     field key NAMES (not values), hasFoto, doctype id from front classifier
 *
 * Usage:
 *   tsx dev/crooked-hardening.ts                    # uses pinned flash
 *   tsx dev/crooked-hardening.ts --bbox-model=gemini-2.5-pro   # escalate for a single sample
 *   tsx dev/crooked-hardening.ts --only=C           # run a single fixture
 */

import * as fs from 'fs'
import * as crypto from 'crypto'
import sharp from 'sharp'
import { configure } from '../src/index'

const FIXTURES = [
    { id: 'A', path: '/Users/avd/Downloads/crooked/cedula-hardening/sample-A-71e58de9_original.jpg', mimetype: 'image/jpeg' },
    { id: 'B', path: '/Users/avd/Downloads/crooked/cedula-hardening/sample-B-5b6df0ac_original.png', mimetype: 'image/png' },
    { id: 'C', path: '/Users/avd/Downloads/crooked/cedula-hardening/sample-C-570bcf5e_original.png', mimetype: 'image/png' },
]

function sha16(b: Buffer): string {
    return crypto.createHash('sha256').update(b).digest('hex').slice(0, 16)
}

async function main() {
    const only = process.argv.find(a => a.startsWith('--only='))?.slice('--only='.length) ?? null
    const bboxModelOverride = process.argv.find(a => a.startsWith('--bbox-model='))?.slice('--bbox-model='.length) ?? null

    const doctypesJson = JSON.parse(fs.readFileSync('/Users/avd/GitHub/jogi/data/doctypes.json', 'utf8'))
    const { GoogleGenAI } = await import('@google/genai')
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

    // Capture the bbox JSON the AI returned for each call so we can print it
    // alongside the V3 verdict. Only the bbox call uses the BBOX_PROMPT marker.
    const bboxResponses: string[] = []

    configure({
        doctypes: doctypesJson,
        geminiCall: async (params: any) => {
            const promptText = params?.contents?.[0]?.parts?.find?.((p: any) => p?.text)?.text ?? ''
            const isBboxCall = promptText.includes('Return the bounding box of EACH side as percentage coordinates')
            const model = isBboxCall && bboxModelOverride ? bboxModelOverride : params.model
            const r = await ai.models.generateContent({ ...params, model })
            if (isBboxCall) {
                const txt: string = (r as any)?.text ?? (r as any)?.candidates?.[0]?.content?.parts?.map?.((p: any) => p?.text ?? '').join?.('') ?? ''
                bboxResponses.push(txt.trim())
            }
            return r
        },
        logger: {
            error: (err: any, ctx: any) => console.error('[docs-error]', err?.message ?? err, ctx ?? ''),
            warn: (msg: any, ctx: any) => console.warn('[docs-warn]', msg, ctx ?? ''),
        },
    })

    const { detectAndSplitCompositeCedulaV3 } = await import('../src/index')

    console.log(`bboxModel: ${bboxModelOverride ?? 'pinned-default-from-source (gemini-2.5-flash)'}\n`)

    const samples = only ? FIXTURES.filter(f => f.id === only) : FIXTURES
    for (const s of samples) {
        const buf = fs.readFileSync(s.path)
        const meta = await sharp(buf).metadata()
        console.log(`=== sample ${s.id} ===`)
        console.log(`  file: ${s.path.split('/').pop()}`)
        console.log(`  bytes=${buf.length} sha16=${sha16(buf)} ${meta.width}x${meta.height} ${s.mimetype}`)

        const bboxBefore = bboxResponses.length
        const t = Date.now()
        let result
        try {
            result = await detectAndSplitCompositeCedulaV3(buf, s.mimetype, 'gemini')
        } catch (err: any) {
            console.log(`  V3 threw: ${err?.message ?? err}\n`)
            continue
        }
        const ms = Date.now() - t

        const bboxRaw = bboxResponses[bboxBefore] ?? '(no bbox call captured)'
        console.log(`  step1 bbox JSON: ${bboxRaw.replace(/\s+/g, ' ').slice(0, 220)}`)

        if (!result) {
            console.log(`  V3 returned null after ${ms}ms\n`)
            continue
        }
        console.log(`  V3 ${ms}ms -> ${result.parts.length} parts`)
        for (const part of result.parts) {
            const m = await sharp(part.buffer).metadata().catch(() => null)
            try {
                const fields = JSON.parse(part.aiFields ?? '{}')
                const keys = Object.entries(fields).filter(([k, v]) => v != null && v !== '' && k !== 'foto_base64').map(([k]) => k)
                console.log(`    partId=${part.partId} trimmed=${m?.width}x${m?.height} bufferBytes=${part.buffer.length} docdatePresent=${!!part.docdate} fieldKeyCount=${keys.length} hasFoto=${fields.foto_base64 ? 'yes' : 'no'}`)
                console.log(`      keys: [${keys.join(', ')}]`)
            } catch {
                console.log(`    partId=${part.partId} aiFields parse error`)
            }
        }
        console.log('')
    }
}

main().catch(err => { console.error('Fatal:', err?.stack ?? err); process.exit(1) })
