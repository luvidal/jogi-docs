import { describe, it, expect } from 'vitest'
import { buildExtractResponseSchema } from '../src/ocr'

function getItem(schema: any): any {
    return schema?.properties?.documents?.items
}

describe('buildExtractResponseSchema', () => {
    it('returns null for doctypes without a hardened data schema', () => {
        expect(buildExtractResponseSchema('carpeta-tributaria', true, [{ start: 1, end: 1 }])).toBeNull()
        expect(buildExtractResponseSchema('cotizaciones-afp', false, [{}])).toBeNull()
    })

    it('wraps covered doctypes in documents[] with typed data', () => {
        const schema = buildExtractResponseSchema('resumen-boletas-sii', true, [{ start: 1, end: 2 }]) as any
        expect(schema.type).toBe('OBJECT')
        expect(schema.required).toEqual(['documents'])

        const item = getItem(schema)
        expect(item.type).toBe('OBJECT')
        expect(item.required).toEqual(['id', 'data', 'start', 'end'])
        expect(item.properties.id.enum).toEqual(['resumen-boletas-sii'])
        expect(item.properties.docdate).toMatchObject({ type: 'STRING', nullable: true })
        expect(item.properties.start).toMatchObject({ type: 'INTEGER', minimum: 1 })
        expect(item.properties.end).toMatchObject({ type: 'INTEGER', minimum: 1 })

        const meses = item.properties.data.properties.meses
        expect(Object.keys(meses.properties).sort()).toEqual([
            'abril', 'agosto', 'diciembre', 'enero', 'febrero', 'julio',
            'junio', 'marzo', 'mayo', 'noviembre', 'octubre', 'septiembre',
        ].sort())
        expect(meses.properties.enero.properties.boletas_vigentes.type).toBe('NUMBER')
    })

    it('keeps PDF start/end optional for forced or rangeless extraction', () => {
        const schema = buildExtractResponseSchema('cedula-identidad', true, [{}]) as any
        const item = getItem(schema)

        expect(item.properties.start).toMatchObject({ type: 'INTEGER', minimum: 1 })
        expect(item.properties.end).toMatchObject({ type: 'INTEGER', minimum: 1 })
        expect(item.required).toEqual(['id', 'data'])
    })

    it('omits page ranges on image extraction schemas', () => {
        const schema = buildExtractResponseSchema('padron', false, [{}]) as any
        const item = getItem(schema)

        expect(item.properties.start).toBeUndefined()
        expect(item.properties.end).toBeUndefined()
        expect(item.required).toEqual(['id', 'data'])
    })
})
