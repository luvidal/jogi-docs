import * as fs from 'fs'
import { configure } from '../src/index'

async function main() {
    const doctypesJson = JSON.parse(fs.readFileSync('/Users/avd/GitHub/jogi/data/doctypes.json', 'utf8'))
    const { GoogleGenAI } = await import('@google/genai')
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
    configure({ doctypes: doctypesJson, geminiCall: (p: any) => ai.models.generateContent(p), logger: { error: () => {}, warn: () => {} } })

    const { Doc2Fields } = await import('../src/index')
    const buf = fs.readFileSync('/Users/avd/Downloads/crooked/cedula-hardening/sample-A-71e58de9_original.jpg')
    try {
        const r = await Doc2Fields(buf, 'image/jpeg', 'gemini', undefined, { skipFace: true })
        console.log('OK:', r?.documents?.[0]?.doc_type_id)
    } catch (err: any) {
        console.log('THREW. ctor=', err?.constructor?.name)
        console.log('  err.name=', err?.name)
        console.log('  err.status=', JSON.stringify(err?.status))
        console.log('  err.code=', JSON.stringify(err?.code))
        console.log('  err.statusCode=', JSON.stringify(err?.statusCode))
        console.log('  err.error=', JSON.stringify(err?.error)?.slice(0, 300))
        console.log('  enumerable keys=', Object.keys(err))
        console.log('  err.message slice=', String(err?.message ?? '').slice(0, 500))
    }
}
main().catch(e => { console.error(e); process.exit(1) })
