import { describe, it, expect } from 'vitest'
import { buildDataSchemaForDoctype, buildClassifyResponseSchema } from '../src/ocr'

/**
 * Phase 2 — per-doctype `data` object schemas. Each covered doctype gets a
 * hand-written schema enforced by Gemini's `responseSchema` so the multi-page
 * classify call returns inline-extractable payloads alongside the
 * classification. Anything outside this set shares the no-data fallback
 * branch.
 *
 * The schemas are deliberately permissive at the field level (every property
 * nullable) so a single missing field on a scanned document doesn't reject the
 * entire response. App-side validators (`@/lib/domain/upload/validators`) and
 * the planner's coverage/overlap checks remain authoritative.
 */
describe('buildDataSchemaForDoctype (Phase 2 per-doctype shapes)', () => {
    function getBranchFor(docTypeId: string, isPDF = true): any {
        const schema = buildClassifyResponseSchema([docTypeId, 'carpeta-tributaria'], isPDF) as any
        const items = schema.properties.documents.items
        const branches = Array.isArray(items.anyOf) ? items.anyOf : [items]
        return branches.find((b: any) => b.properties.id.enum.includes(docTypeId))
    }

    it('returns null for doctypes whose shape is still in flux', () => {
        // Container parents and unaudited doctypes fall into the no-data branch.
        expect(buildDataSchemaForDoctype('carpeta-tributaria')).toBeNull()
        expect(buildDataSchemaForDoctype('cotizaciones-afp')).toBeNull()
        expect(buildDataSchemaForDoctype('balance-anual')).toBeNull()
        expect(buildDataSchemaForDoctype('inversiones')).toBeNull()
    })

    describe('cedula-identidad', () => {
        const data = buildDataSchemaForDoctype('cedula-identidad') as any

        it('lists every cedula scalar as a nullable STRING', () => {
            expect(data.type).toBe('OBJECT')
            for (const key of [
                'rut', 'nombres', 'apellidos', 'nacionalidad', 'sexo',
                'fecha_nacimiento', 'numero_documento', 'fecha_emision',
                'fecha_vencimiento', 'lugar_nacimiento', 'profesion',
            ]) {
                expect(data.properties[key]).toMatchObject({ type: 'STRING', nullable: true })
            }
        })

        it('lands inside its own discriminated branch with docdate', () => {
            const branch = getBranchFor('cedula-identidad')
            expect(branch.properties.data).toEqual(data)
            expect(branch.properties.docdate).toMatchObject({ type: 'STRING', nullable: true })
        })
    })

    describe('liquidaciones-sueldo', () => {
        const data = buildDataSchemaForDoctype('liquidaciones-sueldo') as any

        it('exposes the haberes and descuentos line-item arrays', () => {
            expect(data.type).toBe('OBJECT')
            for (const list of ['haberes', 'descuentos']) {
                expect(data.properties[list].type).toBe('ARRAY')
                expect(data.properties[list].nullable).toBe(true)
                expect(data.properties[list].items.type).toBe('OBJECT')
                expect(data.properties[list].items.properties.label.type).toBe('STRING')
                expect(data.properties[list].items.properties.value.type).toBe('NUMBER')
            }
        })

        it('declares the numeric scalars as nullable NUMBER', () => {
            for (const k of ['dias_trabajados', 'base_imponible', 'base_tributable']) {
                expect(data.properties[k]).toMatchObject({ type: 'NUMBER', nullable: true })
            }
        })
    })

    describe('informe-deuda', () => {
        const data = buildDataSchemaForDoctype('informe-deuda') as any

        it('declares deudas + deudas_indirectas as arrays of debt rows', () => {
            for (const k of ['deudas', 'deudas_indirectas']) {
                const arr = data.properties[k]
                expect(arr.type).toBe('ARRAY')
                const item = arr.items.properties
                for (const num of ['total_credito', 'vigente', 'atraso_30_59', 'atraso_60_89', 'atraso_90_mas']) {
                    expect(item[num].type).toBe('NUMBER')
                }
                expect(item.entidad.type).toBe('STRING')
                expect(item.tipo.type).toBe('STRING')
            }
        })

        it('declares lineas_credito + otros_creditos with directos / indirectos amounts', () => {
            for (const k of ['lineas_credito', 'otros_creditos']) {
                const arr = data.properties[k]
                expect(arr.type).toBe('ARRAY')
                expect(arr.items.properties.entidad.type).toBe('STRING')
                expect(arr.items.properties.directos.type).toBe('NUMBER')
                expect(arr.items.properties.indirectos.type).toBe('NUMBER')
            }
        })
    })

    describe('padron', () => {
        const data = buildDataSchemaForDoctype('padron') as any

        it('declares vehicle scalars and the numeric año + tasacion_fiscal', () => {
            expect(data.properties.tasacion_fiscal).toMatchObject({ type: 'NUMBER', nullable: true })
            expect(data.properties['año']).toMatchObject({ type: 'NUMBER', nullable: true })
            for (const k of [
                'inscripcion', 'rut_propietario', 'propietario', 'domicilio', 'comuna',
                'fecha_adquisicion', 'fecha_inscripcion', 'fecha_emision',
                'marca', 'modelo', 'motor', 'chasis', 'color',
            ]) {
                expect(data.properties[k]).toMatchObject({ type: 'STRING', nullable: true })
            }
        })
    })

    describe('declaracion-anual-impuestos', () => {
        const data = buildDataSchemaForDoctype('declaracion-anual-impuestos') as any

        it('declares año_tributario as a number and codes as a known-key map', () => {
            expect(data.properties['año_tributario']).toMatchObject({ type: 'NUMBER', nullable: true })
            const codes = data.properties.codes
            expect(codes.type).toBe('OBJECT')
            for (const k of ['547', '110', '104', '105', '155', '161', '170', '305']) {
                expect(codes.properties[k]).toMatchObject({ type: 'NUMBER', nullable: true })
            }
        })
    })

    describe('resumen-boletas-sii', () => {
        const data = buildDataSchemaForDoctype('resumen-boletas-sii') as any

        it('nests totales as an OBJECT with the canonical numeric subfields', () => {
            const totales = data.properties.totales
            expect(totales.type).toBe('OBJECT')
            for (const k of [
                'boletas_vigentes', 'boletas_anuladas', 'honorario_bruto',
                'retencion_terceros', 'retencion_contribuyente', 'total_liquido',
            ]) {
                expect(totales.properties[k]).toMatchObject({ type: 'NUMBER', nullable: true })
            }
        })

        it('declares meses with all 12 Spanish month keys, each as the per-month row', () => {
            const meses = data.properties.meses
            expect(meses.type).toBe('OBJECT')
            const monthKeys = [
                'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
            ]
            for (const m of monthKeys) {
                const row = meses.properties[m]
                expect(row.type).toBe('OBJECT')
                expect(row.properties.boletas_vigentes.type).toBe('NUMBER')
                expect(row.properties.honorario_bruto.type).toBe('NUMBER')
                expect(row.properties.retencion.type).toBe('NUMBER')
                expect(row.properties.liquido.type).toBe('NUMBER')
            }
        })
    })
})
