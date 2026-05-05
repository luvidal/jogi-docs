import { describe, it, expect } from 'vitest'
import { buildClassifyResponseSchema } from '../src/ocr'

/**
 * Phase 1 (shape only) for the multi-page classifier `responseSchema`.
 *
 * - `id` is enum-restricted to the candidate doctype list (cuts off-list
 *   hallucinations at the model boundary).
 * - `confidence` is required and bounded `[0, 1]` so downstream destructive-op
 *   gates always have a value to act on.
 * - PDF route requires `start`/`end` integers; image route omits them.
 * - `partId` is enum `front | back` and emitted only when relevant — the schema
 *   keeps it optional + nullable since shape-level enforcement can't condition
 *   on the doctype.
 *
 * Per-doctype `data` schemas come in Phase 2 (Step 8b in the jogi plan).
 */
describe('buildClassifyResponseSchema (Phase 1)', () => {
    const ids = ['cedula-identidad', 'liquidaciones-sueldo', 'carpeta-tributaria']

    it('PDF schema requires id, confidence, start, end and enum-restricts id', () => {
        const schema = buildClassifyResponseSchema(ids, true) as any
        expect(schema.type).toBe('OBJECT')
        expect(schema.required).toEqual(['documents'])

        const doc = schema.properties.documents.items
        expect(doc.type).toBe('OBJECT')
        expect(doc.required).toEqual(['id', 'confidence', 'start', 'end'])
        expect(doc.properties.id.enum).toEqual(ids)
        expect(doc.properties.start.type).toBe('INTEGER')
        expect(doc.properties.start.minimum).toBe(1)
        expect(doc.properties.end.type).toBe('INTEGER')
        expect(doc.properties.end.minimum).toBe(1)
        expect(doc.properties.confidence.type).toBe('NUMBER')
        expect(doc.properties.confidence.minimum).toBe(0)
        expect(doc.properties.confidence.maximum).toBe(1)
    })

    it('image schema omits start/end and only requires id + confidence', () => {
        const schema = buildClassifyResponseSchema(ids, false) as any
        const doc = schema.properties.documents.items
        expect(doc.required).toEqual(['id', 'confidence'])
        expect(doc.properties.start).toBeUndefined()
        expect(doc.properties.end).toBeUndefined()
        expect(doc.properties.id.enum).toEqual(ids)
    })

    it('partId is a nullable enum of front | back on both routes', () => {
        for (const isPDF of [true, false]) {
            const schema = buildClassifyResponseSchema(ids, isPDF) as any
            const part = schema.properties.documents.items.properties.partId
            expect(part.type).toBe('STRING')
            expect(part.enum).toEqual(['front', 'back'])
            expect(part.nullable).toBe(true)
        }
    })

    it('documents is a required array on every route', () => {
        for (const isPDF of [true, false]) {
            const schema = buildClassifyResponseSchema(ids, isPDF) as any
            expect(schema.properties.documents.type).toBe('ARRAY')
            expect(schema.required).toContain('documents')
        }
    })

    it('reflects the candidate enum exactly — caller decides full-catalog vs narrowed', () => {
        const narrowed = ['cedula-identidad']
        const schema = buildClassifyResponseSchema(narrowed, true) as any
        expect(schema.properties.documents.items.properties.id.enum).toEqual(narrowed)
    })
})
