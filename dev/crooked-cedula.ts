/**
 * Crooked diagnosis — V3 reproduction harness.
 *
 * Runs detectAndSplitCompositeCedulaV3 against:
 *   --input=parent  → /Users/avd/Downloads/crooked/shirley-codeudor/CODEUDOR-SHIRLEY-v3-input-20260421.png
 *                    (the rendered page image V3 actually received in production)
 *   --input=control → cedula-front-only.pdf → page1 image (single-card control)
 *
 * Sensitive: prints metadata only (sizes, partIds, field key names, docdates).
 * No PII (names/RUTs/face base64) is logged.
 */

import * as fs from 'fs'
import * as crypto from 'crypto'
import { extractPdfPageAsImage, detectAndSplitCompositeCedulaV3, configure } from '../src/index'

const PARENT_PNG = '/Users/avd/Downloads/crooked/shirley-codeudor/CODEUDOR-SHIRLEY-v3-input-20260421.png'
const CONTROL_PDF = '/Users/avd/Downloads/crooked/shirley-codeudor/cedula-front-only.pdf'

async function loadInput(mode: 'parent' | 'control'): Promise<{ buffer: Buffer; mimetype: string; sha: string; source: string }> {
    if (mode === 'parent') {
        const buf = fs.readFileSync(PARENT_PNG)
        return { buffer: buf, mimetype: 'image/png', sha: sha16(buf), source: PARENT_PNG }
    }
    const pdfBuf = fs.readFileSync(CONTROL_PDF)
    const img = await extractPdfPageAsImage(pdfBuf, 1)
    if (!img) throw new Error('control: extractPdfPageAsImage returned null')
    return { buffer: img, mimetype: 'image/png', sha: sha16(img), source: CONTROL_PDF + ' (page1 -> png)' }
}

function sha16(b: Buffer): string {
    return crypto.createHash('sha256').update(b).digest('hex').slice(0, 16)
}

async function main() {
    const mode = (process.argv.find(a => a.startsWith('--input='))?.slice('--input='.length) ?? 'parent') as 'parent' | 'control'
    const doctypesJson = JSON.parse(fs.readFileSync('/Users/avd/GitHub/jogi/data/doctypes.json', 'utf8'))
    const { GoogleGenAI } = await import('@google/genai')
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
    configure({
        doctypes: doctypesJson,
        geminiCall: (params: any) => ai.models.generateContent(params),
        logger: {
            error: (err: any, ctx: any) => console.error('[docs-error]', err?.message ?? err, ctx ?? ''),
            warn: (msg: any, ctx: any) => console.warn('[docs-warn]', msg, ctx ?? ''),
        },
    })

    const { buffer, mimetype, sha, source } = await loadInput(mode)
    console.log(`mode=${mode}`)
    console.log(`source=${source}`)
    console.log(`mimetype=${mimetype} bytes=${buffer.length} sha16=${sha}`)

    const t = Date.now()
    const result = await detectAndSplitCompositeCedulaV3(buffer, mimetype, 'gemini')
    console.log(`V3: ${Date.now() - t}ms`)
    if (!result) {
        console.log('V3 returned null (no composite detected, or split failed validation)')
        return
    }
    console.log(`V3 returned ${result.parts.length} parts:`)
    for (const part of result.parts) {
        console.log(`  partId=${part.partId} bufferBytes=${part.buffer.length} docdate=${part.docdate}`)
        try {
            const fields = JSON.parse(part.aiFields ?? '{}')
            const nonNullKeys = Object.entries(fields).filter(([k, v]) => v != null && v !== '' && k !== 'foto_base64').map(([k]) => k)
            console.log(`    field keys present: [${nonNullKeys.join(', ')}], hasFoto=${fields.foto_base64 ? 'yes' : 'no'}`)
        } catch {
            console.log('    aiFields parse error')
        }
    }
}

main().catch(err => { console.error('Fatal:', err?.stack ?? err); process.exit(1) })
