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

    // Phase 2 schema may discriminate via `anyOf` branches keyed on `id`.
    // Collect the union of all branch ids regardless of which doctype-with-data
    // branches are split off.
    function collectIds(schema: any): string[] {
        const items = schema?.properties?.documents?.items
        if (!items) return []
        if (Array.isArray(items.anyOf)) {
            const out = new Set<string>()
            for (const branch of items.anyOf) {
                for (const id of branch?.properties?.id?.enum ?? []) out.add(id)
            }
            return [...out]
        }
        return items.properties?.id?.enum ?? []
    }

    function classifyItem(schema: any): any {
        return schema?.properties?.documents?.items
    }

    function isShapeOnlyClassifySchema(schema: any): boolean {
        const item = classifyItem(schema)
        return !!item &&
            !Array.isArray(item.anyOf) &&
            Array.isArray(item.required) &&
            item.required.includes('id') &&
            item.required.includes('confidence') &&
            item.properties?.confidence?.minimum === 0 &&
            item.properties?.confidence?.maximum === 1 &&
            item.properties?.data === undefined &&
            item.properties?.docdate === undefined
    }

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
        expect(collectIds(schemaArg).sort()).toEqual(
            ['cedula-identidad', 'liquidaciones-sueldo'].sort(),
        )
    })

    it('retries schema INVALID_ARGUMENT from classify with the same candidates and a shape-only schema', async () => {
        const pdf = await buildPdf()
        mock2vision
            .mockRejectedValueOnce({ status: 400, error: { status: 'INVALID_ARGUMENT', message: 'Request contains an invalid argument.' } })
            .mockResolvedValueOnce({
                text: '{"documents":[{"id":"informe-deuda","start":1,"end":1,"confidence":0.93}]}',
                usage: undefined,
            })
            .mockResolvedValueOnce({
                text: '{"documents":[{"id":"informe-deuda","start":1,"end":1,"data":{},"docdate":null}]}',
                usage: undefined,
            })

        const result = await Doc2Fields(pdf, 'application/pdf', 'gemini', undefined, {
            allowedDoctypeIds: ['informe-deuda', 'cotizaciones-afp'],
            geminiModels: { classify: 'gemini-2.5-flash', extract: 'gemini-2.5-flash-lite' },
        })

        expect(result.documents[0]).toMatchObject({
            doc_type_id: 'informe-deuda',
            start: 1,
            end: 1,
            confidence: 0.93,
        })
        expect(mock2vision).toHaveBeenCalledTimes(3)
        expect(collectIds(mock2vision.mock.calls[0][5]).sort()).toEqual(['cotizaciones-afp', 'informe-deuda'])
        expect(collectIds(mock2vision.mock.calls[1][5]).sort()).toEqual(['cotizaciones-afp', 'informe-deuda'])
        expect(isShapeOnlyClassifySchema(mock2vision.mock.calls[1][5])).toBe(true)
    })

    it('retries when @google/genai throws ClientError with status only in err.message', async () => {
        // Real production shape from @google/genai: ClientError with NO .status /
        // .code / .statusCode / .error keys — every signal lives inside .message
        // ("got status: 400 Bad Request. {\"error\":{...,\"status\":\"INVALID_ARGUMENT\"}}").
        // Without message-aware detection, the shape-only retry never fires and
        // V3 cedula splits fail end-to-end on the hardening fixtures.
        const pdf = await buildPdf()
        const clientErrorLike = Object.assign(new Error(
            'got status: 400 Bad Request. {"error":{"code":400,"message":"The specified schema produces a constraint that has too many states for serving","status":"INVALID_ARGUMENT"}}',
        ), { name: 'ClientError' })
        mock2vision
            .mockRejectedValueOnce(clientErrorLike)
            .mockResolvedValueOnce({
                text: '{"documents":[{"id":"informe-deuda","start":1,"end":1,"confidence":0.93}]}',
                usage: undefined,
            })
            .mockResolvedValueOnce({
                text: '{"documents":[{"id":"informe-deuda","start":1,"end":1,"data":{},"docdate":null}]}',
                usage: undefined,
            })

        const result = await Doc2Fields(pdf, 'application/pdf', 'gemini', undefined, {
            allowedDoctypeIds: ['informe-deuda', 'cotizaciones-afp'],
            geminiModels: { classify: 'gemini-2.5-flash', extract: 'gemini-2.5-flash-lite' },
        })

        expect(result.documents[0]).toMatchObject({ doc_type_id: 'informe-deuda', confidence: 0.93 })
        expect(mock2vision).toHaveBeenCalledTimes(3)
        expect(isShapeOnlyClassifySchema(mock2vision.mock.calls[1][5])).toBe(true)
    })

    it('drops shape-only fallback docs with missing, malformed, out-of-range, or off-candidate confidence output', async () => {
        const pdf = await buildPdf()
        mock2vision
            .mockRejectedValueOnce({ status: 400, error: { status: 'INVALID_ARGUMENT' }, message: 'INVALID_ARGUMENT' })
            .mockResolvedValueOnce({
                text: JSON.stringify({
                    documents: [
                        { id: 'informe-deuda', start: 1, end: 1 },
                        { id: 'informe-deuda', start: 1, end: 1, confidence: '0.91' },
                        { id: 'informe-deuda', start: 1, end: 1, confidence: 1.2 },
                        { id: 'padron', start: 1, end: 1, confidence: 0.92 },
                    ],
                }),
                usage: undefined,
            })

        const result = await Doc2Fields(pdf, 'application/pdf', 'gemini', undefined, {
            allowedDoctypeIds: ['informe-deuda'],
            geminiModels: { classify: 'gemini-2.5-flash', extract: 'gemini-2.5-flash-lite' },
        })

        expect(result.documents).toEqual([])
        expect(mock2vision).toHaveBeenCalledTimes(2)
    })

    it('keeps valid fallback docs after filtering malformed peers', async () => {
        const pdf = await buildPdf()
        mock2vision
            .mockRejectedValueOnce({ code: '400', message: 'INVALID_ARGUMENT: Request contains an invalid argument.' })
            .mockResolvedValueOnce({
                text: JSON.stringify({
                    documents: [
                        { id: 'informe-deuda', start: 1, end: 1 },
                        { id: 'informe-deuda', start: 1, end: 1, confidence: 0.91 },
                    ],
                }),
                usage: undefined,
            })
            .mockResolvedValueOnce({
                text: '{"documents":[{"id":"informe-deuda","start":1,"end":1,"data":{},"docdate":null}]}',
                usage: undefined,
            })

        const result = await Doc2Fields(pdf, 'application/pdf', 'gemini', undefined, {
            allowedDoctypeIds: ['informe-deuda'],
            geminiModels: { classify: 'gemini-2.5-flash', extract: 'gemini-2.5-flash-lite' },
        })

        expect(result.documents).toHaveLength(1)
        expect(result.documents[0]).toMatchObject({ doc_type_id: 'informe-deuda', confidence: 0.91 })
        expect(mock2vision).toHaveBeenCalledTimes(3)
    })

    it('omitted candidate set keeps the full catalog enum', async () => {
        const pdf = await buildPdf()
        await Doc2Fields(pdf, 'application/pdf', 'gemini', undefined, {
            geminiModels: { classify: 'gemini-2.5-flash', extract: 'gemini-2.5-flash-lite' },
        })
        const firstCall = mock2vision.mock.calls[0]
        expect(firstCall).toBeTruthy()
        const ids = collectIds(firstCall[5])
        // Spot-check: a known pair is present and the list is much larger than
        // any narrowed set we'd test elsewhere.
        expect(ids).toContain('cedula-identidad')
        expect(ids).toContain('liquidaciones-sueldo')
        expect(ids.length).toBeGreaterThan(5)
    })

    it('empty candidate array is treated as no narrowing (defensive)', async () => {
        const pdf = await buildPdf()
        await Doc2Fields(pdf, 'application/pdf', 'gemini', undefined, {
            allowedDoctypeIds: [],
            geminiModels: { classify: 'gemini-2.5-flash', extract: 'gemini-2.5-flash-lite' },
        })
        const firstCall = mock2vision.mock.calls[0]
        const ids = collectIds(firstCall[5])
        // Same ballpark as full catalog — empty allowedDoctypeIds must not
        // produce an empty enum and break the call.
        expect(ids.length).toBeGreaterThan(5)
    })

    it('forced doctype bypasses narrowing — extract path uses the forced doctype schema', async () => {
        const pdf = await buildPdf()
        await Doc2Fields(pdf, 'application/pdf', 'gemini', 'cedula-identidad', {
            allowedDoctypeIds: ['liquidaciones-sueldo'],
            geminiModels: { classify: 'gemini-2.5-flash', extract: 'gemini-2.5-flash-lite' },
        })
        // The forced path calls extractFields, not classifyDocument, so it
        // ignores narrowing. Covered forced doctypes still get the Pass 2
        // extractor schema, with rangeless PDF start/end left optional.
        const firstCall = mock2vision.mock.calls[0]
        expect(firstCall).toBeTruthy()
        const item = firstCall[5]?.properties?.documents?.items
        expect(item?.properties?.id?.enum).toEqual(['cedula-identidad'])
        expect(item?.required).toEqual(['id', 'data'])
    })

    it('preserves a partial container range in mixed PDFs', async () => {
        const pdf = await buildPdf(2)
        mock2vision.mockImplementation(async (_model, _mimetype, _base64, _prompt, _geminiModel, schema) => {
            const ids = collectIds(schema)
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
            const ids = collectIds(schema)
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
