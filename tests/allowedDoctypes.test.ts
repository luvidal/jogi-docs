import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

// Mock the AI vision call so Doc2Fields exercises only the doctype-narrowing
// + schema-construction logic, not the network. Each test inspects the schema
// argument the classifier hands to `model2vision` to confirm the candidate
// enum reflects the `allowedDoctypeIds` passed into Doc2Fields.

const mock2vision = vi.fn(async () => ({ text: '{"documents":[]}', usage: undefined }))

vi.mock('../src/ai', async () => {
    const actual = await vi.importActual<typeof import('../src/ai')>('../src/ai')
    return {
        ...actual,
        model2vision: (...args: any[]) => mock2vision(...args),
    }
})

import { Doc2Fields } from '../src/ocr'
import { configure } from '../src/config'
import { PDFDocument } from 'pdf-lib'

// Minimal stand-in doctype catalog. The narrowing test only needs the ids to
// flow through `loadSchemas()` → `buildClassifyResponseSchema` enum, so a tiny
// fixture suffices and keeps the test independent of the host's real config.
// `fields` must be an array (consumed by expandFields), even when empty.
const stub = (label: string, freq = 'once', count = 1, extra: Record<string, unknown> = {}) => ({
    label, freq, count, definition: label, fields: [], ...extra,
})
const fixtureDoctypes: Record<string, any> = {
    'cedula-identidad': stub('Cédula', 'once', 1, { parts: ['front', 'back'] }),
    'liquidaciones-sueldo': stub('Liquidación', 'monthly', 6),
    'carpeta-tributaria': stub('Carpeta Tributaria', 'once', 1, { contains: ['declaracion-anual-impuestos'] }),
    'declaracion-anual-impuestos': stub('DAI', 'annual', 1),
    'informe-deuda': stub('Informe deuda'),
    'cotizaciones-afp': stub('Cotizaciones AFP', 'monthly', 12),
    'padron': stub('Padrón'),
    'balance-anual': stub('Balance', 'annual', 1),
}

beforeAll(() => {
    configure({ doctypes: fixtureDoctypes })
})

async function buildPdf(pageCount = 1): Promise<Buffer> {
    const doc = await PDFDocument.create()
    for (let i = 0; i < pageCount; i++) doc.addPage([200, 200])
    const bytes = await doc.save()
    return Buffer.from(bytes)
}

describe('Doc2Fields — Phase 7a candidate-doctype narrowing', () => {
    beforeEach(() => {
        mock2vision.mockReset()
        mock2vision.mockResolvedValue({ text: '{"documents":[]}', usage: undefined })
    })

    it('narrowed candidate set restricts the schema enum to that subset', async () => {
        const pdf = await buildPdf()
        await Doc2Fields(pdf, 'application/pdf', 'gemini', undefined, {
            allowedDoctypeIds: ['cedula-identidad', 'liquidaciones-sueldo'],
            geminiModels: { classify: 'gemini-2.5-flash', extract: 'gemini-2.5-flash-lite' },
        })

        // First call is the classify pass (single-page PDF route).
        const firstCall = mock2vision.mock.calls[0]
        expect(firstCall).toBeTruthy()
        const schemaArg = firstCall[5]
        expect(schemaArg).toBeTruthy()
        const enum_ = schemaArg.properties.documents.items.properties.id.enum
        expect(enum_).toEqual(['cedula-identidad', 'liquidaciones-sueldo'])
    })

    it('omitted candidate set keeps the full catalog enum', async () => {
        const pdf = await buildPdf()
        await Doc2Fields(pdf, 'application/pdf', 'gemini', undefined, {
            geminiModels: { classify: 'gemini-2.5-flash', extract: 'gemini-2.5-flash-lite' },
        })
        const firstCall = mock2vision.mock.calls[0]
        expect(firstCall).toBeTruthy()
        const enum_ = firstCall[5].properties.documents.items.properties.id.enum
        // Spot-check: a known pair is present and the list is much larger than
        // any narrowed set we'd test elsewhere.
        expect(enum_).toContain('cedula-identidad')
        expect(enum_).toContain('liquidaciones-sueldo')
        expect(enum_.length).toBeGreaterThan(5)
    })

    it('empty candidate array is treated as no narrowing (defensive)', async () => {
        const pdf = await buildPdf()
        await Doc2Fields(pdf, 'application/pdf', 'gemini', undefined, {
            allowedDoctypeIds: [],
            geminiModels: { classify: 'gemini-2.5-flash', extract: 'gemini-2.5-flash-lite' },
        })
        const firstCall = mock2vision.mock.calls[0]
        const enum_ = firstCall[5].properties.documents.items.properties.id.enum
        // Same ballpark as full catalog — empty allowedDoctypeIds must not
        // produce an empty enum and break the call.
        expect(enum_.length).toBeGreaterThan(5)
    })

    it('forced doctype bypasses narrowing — extract path runs without classify schema', async () => {
        const pdf = await buildPdf()
        await Doc2Fields(pdf, 'application/pdf', 'gemini', 'cedula-identidad', {
            allowedDoctypeIds: ['liquidaciones-sueldo'],
            geminiModels: { classify: 'gemini-2.5-flash', extract: 'gemini-2.5-flash-lite' },
        })
        // The forced path calls extractFields, not classifyDocument — so the
        // sixth arg (schema) is undefined on this call.
        const firstCall = mock2vision.mock.calls[0]
        expect(firstCall).toBeTruthy()
        expect(firstCall[5]).toBeUndefined()
    })

    it('preserves a partial container range in mixed PDFs', async () => {
        const pdf = await buildPdf(2)
        mock2vision.mockImplementation(async (_model, _mimetype, _base64, _prompt, _geminiModel, schema) => {
            const ids = schema?.properties?.documents?.items?.properties?.id?.enum ?? []
            const isClassify = Array.isArray(ids) && ids.length > 0
            if (!isClassify) {
                return { text: '{"documents":[{"id":"extract","data":{},"docdate":null}]}', usage: undefined }
            }

            const callIndex = mock2vision.mock.calls.length
            if (ids.includes('carpeta-tributaria') && ids.includes('informe-deuda')) {
                return callIndex === 1
                    ? { text: '{"documents":[{"id":"carpeta-tributaria","confidence":0.96}]}', usage: undefined }
                    : { text: '{"documents":[{"id":"informe-deuda","confidence":0.94}]}', usage: undefined }
            }
            return { text: '{"documents":[]}', usage: undefined }
        })

        const result = await Doc2Fields(pdf, 'application/pdf', 'gemini', undefined, {
            geminiModels: { classify: 'gemini-2.5-flash', extract: 'gemini-2.5-flash-lite' },
        })

        const carpeta = result.documents.find((d: any) => d.doc_type_id === 'carpeta-tributaria')
        const informe = result.documents.find((d: any) => d.doc_type_id === 'informe-deuda')
        expect(carpeta).toMatchObject({ doc_type_id: 'carpeta-tributaria', start: 1, end: 1, confidence: 0.96 })
        expect(informe).toMatchObject({ doc_type_id: 'informe-deuda', start: 2, end: 2, confidence: 0.94 })
    })

    it('preserves confidence when expanding multi-count PDF ranges', async () => {
        const pdf = await buildPdf(2)
        mock2vision.mockImplementation(async (_model, _mimetype, _base64, _prompt, _geminiModel, schema) => {
            const ids = schema?.properties?.documents?.items?.properties?.id?.enum ?? []
            const isClassify = Array.isArray(ids) && ids.length > 0
            if (isClassify) {
                return {
                    text: '{"documents":[{"id":"cotizaciones-afp","start":1,"end":2,"confidence":0.91}]}',
                    usage: undefined,
                }
            }
            return { text: '{"documents":[{"id":"extract","data":{},"docdate":null}]}', usage: undefined }
        })

        const result = await Doc2Fields(pdf, 'application/pdf', 'gemini', undefined, {
            geminiModels: { classify: 'gemini-2.5-flash', extract: 'gemini-2.5-flash-lite' },
        })

        const cotizaciones = result.documents.filter((d: any) => d.doc_type_id === 'cotizaciones-afp')
        expect(cotizaciones).toHaveLength(2)
        expect(cotizaciones.map((d: any) => d.start)).toEqual([1, 2])
        expect(cotizaciones.map((d: any) => d.end)).toEqual([1, 2])
        expect(cotizaciones.map((d: any) => d.confidence)).toEqual([0.91, 0.91])
    })
})
