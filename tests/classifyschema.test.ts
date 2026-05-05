import { describe, it, expect } from 'vitest'
import { buildClassifyResponseSchema } from '../src/ocr'

/**
 * Phase 2 schema shape — per-doctype `data` schemas land as discriminated
 * `anyOf` branches keyed on `id`. Anything outside the covered doctype set
 * shares one fallback branch with no `data` constraint.
 *
 * Phase 1 invariants still hold inside every branch (per-doctype tests in
 * `dataSchema.test.ts` validate the actual `data` shape):
 * - `id` enum acts as the discriminator.
 * - `confidence` required, bounded `[0, 1]`.
 * - PDF route requires `start`/`end` integers; image route omits them.
 * - `partId` is the nullable `front | back` enum.
 */
describe('buildClassifyResponseSchema (Phase 2 shape)', () => {
    // Mix: 1 covered (cedula) + 1 uncovered (carpeta-tributaria).
    const mixed = ['cedula-identidad', 'carpeta-tributaria']
    const onlyUncovered = ['carpeta-tributaria']

    function getBranches(schema: any): any[] {
        const items = schema.properties.documents.items
        return Array.isArray(items.anyOf) ? items.anyOf : [items]
    }

    it('PDF schema discriminates on id and requires id, confidence, start, end per branch', () => {
        const schema = buildClassifyResponseSchema(mixed, true) as any
        expect(schema.type).toBe('OBJECT')
        expect(schema.required).toEqual(['documents'])

        const branches = getBranches(schema)
        expect(branches.length).toBeGreaterThanOrEqual(2)

        // Every branch carries the Phase 1 invariants and discriminates id via enum.
        for (const branch of branches) {
            expect(branch.type).toBe('OBJECT')
            expect(branch.required).toEqual(['id', 'confidence', 'start', 'end'])
            expect(Array.isArray(branch.properties.id.enum)).toBe(true)
            expect(branch.properties.id.enum.length).toBeGreaterThanOrEqual(1)
            expect(branch.properties.start.type).toBe('INTEGER')
            expect(branch.properties.start.minimum).toBe(1)
            expect(branch.properties.end.type).toBe('INTEGER')
            expect(branch.properties.confidence.type).toBe('NUMBER')
            expect(branch.properties.confidence.minimum).toBe(0)
            expect(branch.properties.confidence.maximum).toBe(1)
        }

        // The covered doctype gets its own branch with `data`.
        const cedulaBranch = branches.find(b => b.properties.id.enum.includes('cedula-identidad'))
        expect(cedulaBranch).toBeDefined()
        expect(cedulaBranch.properties.data).toBeDefined()
        expect(cedulaBranch.properties.docdate).toBeDefined()

        // Uncovered doctypes share the fallback branch — no `data`/`docdate`.
        const fallback = branches.find(b => b.properties.id.enum.includes('carpeta-tributaria'))
        expect(fallback).toBeDefined()
        expect(fallback.properties.data).toBeUndefined()
        expect(fallback.properties.docdate).toBeUndefined()
    })

    it('image schema omits start/end on every branch', () => {
        const schema = buildClassifyResponseSchema(mixed, false) as any
        for (const branch of getBranches(schema)) {
            expect(branch.required).toEqual(['id', 'confidence'])
            expect(branch.properties.start).toBeUndefined()
            expect(branch.properties.end).toBeUndefined()
        }
    })

    it('partId is a nullable enum of front | back on every branch', () => {
        for (const isPDF of [true, false]) {
            const schema = buildClassifyResponseSchema(mixed, isPDF) as any
            for (const branch of getBranches(schema)) {
                const part = branch.properties.partId
                expect(part.type).toBe('STRING')
                expect(part.enum).toEqual(['front', 'back'])
                expect(part.nullable).toBe(true)
            }
        }
    })

    it('documents is a required array on every route', () => {
        for (const isPDF of [true, false]) {
            const schema = buildClassifyResponseSchema(mixed, isPDF) as any
            expect(schema.properties.documents.type).toBe('ARRAY')
            expect(schema.required).toContain('documents')
        }
    })

    it('without any covered doctypes, the fallback branch is the sole branch', () => {
        const schema = buildClassifyResponseSchema(onlyUncovered, true) as any
        const branches = getBranches(schema)
        expect(branches).toHaveLength(1)
        expect(branches[0].properties.id.enum).toEqual(onlyUncovered)
        expect(branches[0].properties.data).toBeUndefined()
    })

    it('reflects the candidate enum exactly — caller decides full-catalog vs narrowed', () => {
        const narrowed = ['cedula-identidad']
        const schema = buildClassifyResponseSchema(narrowed, true) as any
        const branches = getBranches(schema)
        expect(branches).toHaveLength(1)
        expect(branches[0].properties.id.enum).toEqual(narrowed)
        // Sole-branch path — covered doctype carries `data`.
        expect(branches[0].properties.data).toBeDefined()
    })
})
