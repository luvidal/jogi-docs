import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

const mock2vision = vi.fn()

vi.mock('../src/ai', async () => {
    const actual = await vi.importActual<typeof import('../src/ai')>('../src/ai')
    return {
        ...actual,
        model2vision: (...args: any[]) => mock2vision(...args),
    }
})

import { PDFDocument } from 'pdf-lib'
import { configure } from '../src/config'
import { Doc2Fields } from '../src/ocr'

const stub = (label: string, freq = 'once', count = 1, fields: any[] = [], extra: Record<string, unknown> = {}) => ({
    label,
    freq,
    count,
    definition: label,
    fields,
    ...extra,
})

const fixtureDoctypes: Record<string, any> = {
    'resumen-boletas-sii': stub('Resumen Boletas', 'annual', 1, [
        { key: 'rut', type: 'string' },
        { key: 'contribuyente', type: 'string' },
        { key: 'año', type: 'num' },
        { key: 'meses.enero.boletas_vigentes', type: 'num' },
        { key: 'meses.enero.honorario_bruto', type: 'num' },
    ]),
    'cedula-identidad': stub('Cédula', 'once', 1, [
        { key: 'rut', type: 'string' },
        { key: 'nombres', type: 'string' },
    ], { parts: ['front', 'back'] }),
    'carpeta-tributaria': stub('Carpeta Tributaria'),
}

beforeAll(() => {
    configure({ doctypes: fixtureDoctypes })
})

beforeEach(() => {
    mock2vision.mockReset()
})

async function buildPdf(pageCount = 1): Promise<Buffer> {
    const doc = await PDFDocument.create()
    for (let i = 0; i < pageCount; i++) doc.addPage([200, 200])
    return Buffer.from(await doc.save())
}

function isClassifyPrompt(prompt: string): boolean {
    return prompt.includes('Identifica los tipos de documento')
}

function extractItem(schema: any): any {
    return schema?.properties?.documents?.items
}

describe('Doc2Fields extraction hardening', () => {
    it('passes a schema-enforced extractor through the image path and merges Pass 1 gaps', async () => {
        mock2vision.mockImplementation(async (_model, _mimetype, _base64, prompt, _geminiModel, schema) => {
            if (isClassifyPrompt(prompt)) {
                expect(schema).toBeTruthy()
                return {
                    text: JSON.stringify({
                        documents: [{
                            id: 'resumen-boletas-sii',
                            confidence: 0.98,
                            data: {
                                año: 2024,
                                meses: { enero: { boletas_vigentes: 1 } },
                            },
                            docdate: '2024-01-01',
                        }],
                    }),
                    usage: undefined,
                }
            }

            expect(extractItem(schema).properties.id.enum).toEqual(['resumen-boletas-sii'])
            expect(extractItem(schema).required).toEqual(['id', 'data'])
            return {
                text: JSON.stringify({
                    documents: [{
                        id: 'resumen-boletas-sii',
                        data: {
                            meses: {
                                enero: {
                                    boletas_vigentes: null,
                                    honorario_bruto: 2000000,
                                },
                            },
                        },
                        docdate: '2024-01-01',
                    }],
                }),
                usage: undefined,
            }
        })

        const result = await Doc2Fields(Buffer.from('image'), 'image/png', 'gemini')

        expect(mock2vision).toHaveBeenCalledTimes(2)
        expect(result.documents).toHaveLength(1)
        expect(result.documents[0]).toMatchObject({
            doc_type_id: 'resumen-boletas-sii',
            docdate: '2024-01-01',
            confidence: 0.98,
        })
        expect(result.documents[0].data).toEqual({
            año: 2024,
            meses: {
                enero: {
                    boletas_vigentes: 1,
                    honorario_bruto: 2000000,
                },
            },
        })
    })

    it('does not run the shape-only retry for extractor INVALID_ARGUMENT failures', async () => {
        mock2vision
            .mockResolvedValueOnce({
                text: JSON.stringify({
                    documents: [{
                        id: 'resumen-boletas-sii',
                        confidence: 0.98,
                    }],
                }),
                usage: undefined,
            })
            .mockRejectedValueOnce({ status: 400, error: { status: 'INVALID_ARGUMENT' }, message: 'INVALID_ARGUMENT' })

        await expect(Doc2Fields(Buffer.from('image'), 'image/png', 'gemini')).rejects.toMatchObject({ status: 400 })

        expect(mock2vision).toHaveBeenCalledTimes(2)
        expect(isClassifyPrompt(mock2vision.mock.calls[0][3])).toBe(true)
        expect(isClassifyPrompt(mock2vision.mock.calls[1][3])).toBe(false)
    })

    it('deep-merges Pass 1 and Pass 2 data for PDFs with Pass 2 field precedence', async () => {
        const pdf = await buildPdf()
        mock2vision.mockImplementation(async (_model, _mimetype, _base64, prompt) => {
            if (isClassifyPrompt(prompt)) {
                return {
                    text: JSON.stringify({
                        documents: [{
                            id: 'resumen-boletas-sii',
                            start: 1,
                            end: 1,
                            confidence: 0.97,
                            data: {
                                año: 2024,
                                meses: {
                                    enero: {
                                        boletas_vigentes: 1,
                                        honorario_bruto: 1900000,
                                    },
                                },
                            },
                            docdate: '2024-01-01',
                        }],
                    }),
                    usage: undefined,
                }
            }

            return {
                text: JSON.stringify({
                    documents: [{
                        id: 'resumen-boletas-sii',
                        start: 1,
                        end: 1,
                        data: {
                            meses: {
                                enero: {
                                    honorario_bruto: 2000000,
                                },
                            },
                        },
                        docdate: '2024-01-01',
                    }],
                }),
                usage: undefined,
            }
        })

        const result = await Doc2Fields(pdf, 'application/pdf', 'gemini')

        expect(result.documents[0].data).toEqual({
            año: 2024,
            meses: {
                enero: {
                    boletas_vigentes: 1,
                    honorario_bruto: 2000000,
                },
            },
        })
    })

    it('schema-enforces forced covered doctypes without requiring PDF ranges', async () => {
        const pdf = await buildPdf()
        mock2vision.mockResolvedValue({
            text: '{"documents":[{"id":"resumen-boletas-sii","data":{"año":2024},"docdate":"2024-01-01"}]}',
            usage: undefined,
        })

        await Doc2Fields(pdf, 'application/pdf', 'gemini', 'resumen-boletas-sii')

        const schema = mock2vision.mock.calls[0][5]
        expect(schema).toBeTruthy()
        const item = extractItem(schema)
        expect(item.properties.start).toBeDefined()
        expect(item.properties.end).toBeDefined()
        expect(item.required).toEqual(['id', 'data'])
    })

    it('leaves forced uncovered doctypes schemaless', async () => {
        mock2vision.mockResolvedValue({
            text: '{"documents":[{"id":"carpeta-tributaria","data":{"folio":"abc"}}]}',
            usage: undefined,
        })

        await Doc2Fields(Buffer.from('image'), 'image/png', 'gemini', 'carpeta-tributaria')

        expect(mock2vision.mock.calls[0][5]).toBeUndefined()
    })
})
