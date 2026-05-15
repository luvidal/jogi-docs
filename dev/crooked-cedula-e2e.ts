/**
 * Crooked diagnosis — Task 1 candidate-fix proof.
 *
 * Monkey-patches the bbox model used inside V3's first step from the current
 * default ('gemini-2.5-flash-lite') to 'gemini-2.5-flash' or 'gemini-2.5-pro',
 * then runs detectAndSplitCompositeCedulaV3 end-to-end on the recovered
 * Shirley page image. Reports only metadata (parts count, partIds, buffer
 * sizes, present field-key names, docdate) — never card content.
 *
 * Use: --bbox-model=gemini-2.5-flash (or =gemini-2.5-pro)
 */

import * as fs from 'fs'
import * as crypto from 'crypto'
import { configure } from '../src/index'
import { promises as fsp } from 'fs'

const PARENT_PNG = '/Users/avd/Downloads/crooked/shirley-codeudor/CODEUDOR-SHIRLEY-v3-input-20260421.png'

async function main() {
    const bboxModel = process.argv.find(a => a.startsWith('--bbox-model='))?.slice('--bbox-model='.length) ?? 'gemini-2.5-flash-lite'

    const doctypesJson = JSON.parse(fs.readFileSync('/Users/avd/GitHub/jogi/data/doctypes.json', 'utf8'))
    const { GoogleGenAI } = await import('@google/genai')
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

    // Wrap the host geminiCall: when V3's BBOX_PROMPT is being sent, force the
    // model to the requested bboxModel; pass everything else through unchanged.
    configure({
        doctypes: doctypesJson,
        geminiCall: (params: any) => {
            const promptText = params?.contents?.[0]?.parts?.find?.((p: any) => p?.text)?.text ?? ''
            const isBboxCall = promptText.includes('Return the bounding box of EACH side as percentage coordinates')
            const model = isBboxCall ? bboxModel : params.model
            return ai.models.generateContent({ ...params, model })
        },
        logger: {
            error: (err: any, ctx: any) => console.error('[docs-error]', err?.message ?? err, ctx ?? ''),
            warn: (msg: any, ctx: any) => console.warn('[docs-warn]', msg, ctx ?? ''),
        },
    })

    // Defer import until after configure() so the satellite uses our gemini call.
    const { detectAndSplitCompositeCedulaV3 } = await import('../src/index')

    const buf = await fsp.readFile(PARENT_PNG)
    const sha = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16)
    console.log(`source=${PARENT_PNG}`)
    console.log(`bytes=${buf.length} sha16=${sha} bboxModel=${bboxModel}`)

    const t = Date.now()
    const result = await detectAndSplitCompositeCedulaV3(buf, 'image/png', 'gemini')
    console.log(`V3: ${Date.now() - t}ms`)
    if (!result) { console.log('V3 returned null'); return }
    console.log(`V3 returned ${result.parts.length} parts:`)
    for (const part of result.parts) {
        console.log(`  partId=${part.partId} bufferBytes=${part.buffer.length} docdate=${part.docdate}`)
        try {
            const fields = JSON.parse(part.aiFields ?? '{}')
            const keys = Object.entries(fields).filter(([k, v]) => v != null && v !== '' && k !== 'foto_base64').map(([k]) => k)
            console.log(`    field-key count=${keys.length} hasFoto=${fields.foto_base64 ? 'yes' : 'no'}`)
        } catch {
            console.log('    aiFields parse error')
        }
    }
}

main().catch(err => { console.error('Fatal:', err?.stack ?? err); process.exit(1) })
