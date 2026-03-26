/**
 * OCR and Document Field Extraction
 *
 * Extracts structured data from uploaded Chilean documents using AI vision
 * models (Gemini Flash primary, Claude Haiku fallback).
 *
 * ## Extraction Strategy
 *
 * ### Images → Single-pass (classifyAndExtractImage)
 * One API call that classifies AND extracts fields simultaneously.
 *
 * ### PDFs → Multi-pass (detectDocumentBoundaries → classifyDocument → extractFields)
 * Pass 0 — Split: detect document boundaries in multi-doc PDFs (no doctype knowledge)
 * Pass 1 — Classify: each document individually with doctype definitions + field schemas
 * Pass 2 — Extract: per-type field schemas, parallel across types
 *
 * ## Face Photo Extraction (Cédula)
 * AWS Rekognition via extractFace() — single call, picks largest face.
 */

import { model2vision } from './ai'
import type { VisionResult } from './ai'
import { getDoctypes, getDoctypesMap } from './doctypes'
import { getLogger } from './config'
import { PDFDocument } from 'pdf-lib'
import { extractFace } from './faceextract'
import sharp from 'sharp'
import { createHash } from 'crypto'
import type { ModelArg, ExtractionResult, AIUsage } from './types'

/** Accumulate token usage across multiple AI calls */
function addUsage(total: AIUsage, add?: AIUsage): AIUsage {
    if (!add) return total
    return {
        promptTokenCount: (total.promptTokenCount ?? 0) + (add.promptTokenCount ?? 0),
        candidatesTokenCount: (total.candidatesTokenCount ?? 0) + (add.candidatesTokenCount ?? 0),
    }
}

// ─── Cache Helpers ───────────────────────────────────────────────────────────

// Bump this string whenever prompt templates change (classifyDocument, classifyAndExtractImage, extractFields)
const PROMPT_TEMPLATE_VERSION = 'v4'

/**
 * Returns a short hash that changes when doctypes schema or prompt templates change.
 * Used as part of the AI cache key.
 */
export function getPromptVersion(): string {
    return createHash('sha256')
        .update(JSON.stringify(getDoctypes()))
        .update(PROMPT_TEMPLATE_VERSION)
        .digest('hex')
        .slice(0, 12)
}

/**
 * Build a cache key from the three inputs that determine AI output:
 * file content (hash), model, and prompt version.
 */
export function buildCacheKey(fileHash: string, model: string, promptVersion: string): string {
    return createHash('sha256')
        .update(fileHash + model + promptVersion)
        .digest('hex')
        .slice(0, 32)
}

// Lazy-load pdf-to-png-converter to avoid loading native canvas at startup
let pdfToPngModule: typeof import('pdf-to-png-converter') | null = null
const getPdfToPng = async () => {
    if (!pdfToPngModule) {
        pdfToPngModule = await import('pdf-to-png-converter')
    }
    return pdfToPngModule.pdfToPng
}

/**
 * Extract a specific page from a PDF as a PNG image buffer
 */
export async function extractPdfPageAsImage(pdfBuffer: Buffer, pageNumber: number): Promise<Buffer | null> {
    try {
        const arrayBuffer = pdfBuffer.buffer.slice(
            pdfBuffer.byteOffset,
            pdfBuffer.byteOffset + pdfBuffer.byteLength
        )

        const pdfToPng = await getPdfToPng()
        const pages = await pdfToPng(arrayBuffer, {
            pagesToProcess: [pageNumber],
            viewportScale: 2.0,
            returnPageContent: true,
        })

        if (pages.length > 0 && pages[0].content) {
            return Buffer.from(pages[0].content)
        }
        return null
    } catch {
        return null
    }
}

/**
 * Detect which side of a cedula is shown in an image
 */
export async function detectCedulaSide(
    buffer: Buffer,
    mimetype: string,
    model: ModelArg = 'gemini'
): Promise<{ side: 'front' | 'back' | null; confidence: number; data?: object }> {
    const isImage = mimetype.startsWith('image/')
    const isPDF = mimetype === 'application/pdf'
    if (!isImage && !isPDF) throw new Error('Images and PDFs only')

    const base64 = buffer.toString('base64')

    const prompt = `
    Analiza esta imagen de una Cédula de Identidad chilena y determina si es el FRENTE o el REVÉS.

    **FRENTE (front)** - Características:
    - Foto del titular
    - Nombre completo
    - RUT
    - Nacionalidad
    - Fecha de nacimiento
    - Sexo
    - Número de documento
    - Fecha de emisión/vencimiento

    **REVÉS (back)** - Características:
    - Huella dactilar
    - Firma del titular
    - Código de barras o QR
    - Dirección (en cédulas antiguas)
    - Profesión u oficio
    - Texto institucional del Registro Civil

    Devuelve SOLO este JSON:
    {
      "side": "front" | "back" | null,
      "confidence": 0.0-1.0,
      "reason": "breve explicación",
      "data": {
        // Si es front: rut, nombres, apellidos, fecha_nacimiento, foto_bbox, etc.
        // Si es back: profesion, lugar_nacimiento ("Nació en"), direccion (si visible)
      }
    }

    **UBICACIÓN DE LA FOTO (solo si es FRENTE)**:
    Si detectas que es el FRENTE de la cédula, incluye el campo "foto_bbox" con las coordenadas del recuadro de la foto del titular.
    Las coordenadas deben ser porcentajes (0-100) relativos al tamaño de la imagen.
    IMPORTANTE: La foto incluye cabeza completa, cuello y parte de los hombros. Incluye TODO el rostro desde la parte superior de la cabeza.
    - x: posición horizontal del borde izquierdo de la foto
    - y: posición vertical del borde superior de la foto (empieza ARRIBA de la cabeza)
    - width: ancho de la foto
    - height: alto de la foto (debe cubrir desde arriba de la cabeza hasta los hombros)
    En cédulas chilenas, la foto típicamente está en la esquina superior izquierda.
    Ejemplo: "foto_bbox": { "x": 3, "y": 12, "width": 28, "height": 45 }

    Si la imagen NO es una cédula chilena, devuelve side: null.
    `

    const aiModel = model === 'gpt5' ? 'GPT' : model === 'gemini' ? 'GEMINI' : 'ANTHROPIC'
    const vr = await model2vision(aiModel as any, mimetype, base64, prompt)
    let text = vr.text.replace(/```json|```/g, '').trim()

    try {
        const parsed = JSON.parse(text)
        const data = parsed.data || {}

        if (parsed.side === 'front') {
            let imageBuffer: Buffer | null = null

            if (isImage) {
                imageBuffer = buffer
            } else if (isPDF) {
                imageBuffer = await extractPdfPageAsImage(buffer, 1)
            }

            if (imageBuffer) {
                const result = await extractFace(imageBuffer)
                if (result) {
                    data.foto_base64 = result.face
                }
            }
            delete data.foto_bbox
        }

        return {
            side: parsed.side === 'front' || parsed.side === 'back' ? parsed.side : null,
            confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
            data
        }
    } catch {
        return { side: null, confidence: 0 }
    }
}

// ─── Two-Pass Extraction ─────────────────────────────────────────────────────

type AiModel = 'GPT' | 'ANTHROPIC' | 'GEMINI'

const toAiModel = (m: ModelArg): AiModel =>
    m === 'gpt5' ? 'GPT' : m === 'gemini' ? 'GEMINI' : 'ANTHROPIC'

function loadSchemas() {
    const doctypes = getDoctypes()
    const mapById = getDoctypesMap()
    return { doctypes, mapById }
}

/** Parse raw AI response into normalized document array */
export function parseRawDocs(text: string): any[] {
    const cleaned = text.replace(/```json|```/g, '').trim()
    if (!cleaned) return []
    try {
        const parsed = JSON.parse(cleaned)
        if (Array.isArray(parsed)) {
            if (parsed.length > 0 && Array.isArray(parsed[0]?.documents)) {
                return parsed.flatMap((p: any) => p.documents || [])
            }
            return parsed
        }
        if (Array.isArray(parsed?.documents)) return parsed.documents
        if (parsed?.id || parsed?.doctypeid) return [parsed]
        return []
    } catch {
        // Truncated JSON — extract complete top-level objects by brace-matching
        const recovered: any[] = []
        let i = 0
        while (i < cleaned.length) {
            if (cleaned[i] === '{') {
                let depth = 0, inStr = false, escape = false
                const start = i
                for (; i < cleaned.length; i++) {
                    const ch = cleaned[i]
                    if (escape) { escape = false; continue }
                    if (ch === '\\' && inStr) { escape = true; continue }
                    if (ch === '"' && !escape) { inStr = !inStr; continue }
                    if (inStr) continue
                    if (ch === '{') depth++
                    else if (ch === '}') { depth--; if (depth === 0) { i++; break } }
                }
                if (depth === 0) {
                    try {
                        const obj = JSON.parse(cleaned.slice(start, i))
                        if (obj.id || obj.doctypeid || obj.doc_type_id) recovered.push(obj)
                    } catch { /* skip malformed */ }
                }
            } else {
                i++
            }
        }
        return recovered
    }
}

/** Normalize a single raw doc entry from AI response */
export function normalizeDoc(d: any) {
    const id = d?.id || d?.doctypeid || null
    const META_KEYS = new Set(['id', 'doctypeid', 'doc_type_id', 'data', 'docdate', 'document_date', 'documentDate', 'start', 'end', 'partId', 'part_id', 'partid', 'label'])
    const flatData = Object.fromEntries(Object.entries(d || {}).filter(([k]) => !META_KEYS.has(k)))
    const data = d?.data && typeof d.data === 'object' ? d.data : Object.keys(flatData).length > 0 ? flatData : {}
    const rawDate = d?.docdate || d?.document_date || d?.documentDate || null
    // Validate YYYY-MM-DD format — AI sometimes returns DD/MM/YYYY or free text
    const docdate = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && !isNaN(new Date(`${rawDate}T12:00:00`).getTime()) ? rawDate : null
    const start = Number.isFinite(d?.start) ? Number(d.start) : (d?.start ? parseInt(d.start, 10) : undefined)
    const end = Number.isFinite(d?.end) ? Number(d.end) : (d?.end ? parseInt(d.end, 10) : undefined)
    const partId = d?.partId || d?.part_id || d?.partid || undefined
    return { id, data, docdate, start, end, partId }
}

// ─── Pass 0: Detect document boundaries in multi-doc PDFs ───────────────────

async function detectDocumentBoundaries(
    base64: string, model: AiModel, totalPages: number,
    usageAccum?: AIUsage
): Promise<Array<{ start: number; end: number }>> {
    const prompt = `Este PDF tiene ${totalPages} páginas y puede contener múltiples documentos combinados.
Identifica los límites de cada documento separado dentro del PDF.
Devuelve JSON: {"documents":[{"start":1,"end":3},{"start":4,"end":4},{"start":5,"end":8}]}
- "start"/"end": páginas 1-indexed
- Cada documento es un bloque continuo de páginas que pertenecen al mismo documento original
- Busca cambios de formato, encabezados, logos, o estilos que indiquen un documento diferente
- Si todo el PDF es un solo documento, devuelve [{"start":1,"end":${totalPages}}]
- Solo JSON, sin markdown`

    const vr = await model2vision(model, 'application/pdf', base64, prompt)
    if (usageAccum) Object.assign(usageAccum, addUsage(usageAccum, vr.usage))
    const parsed = parseRawDocs(vr.text)

    if (!parsed.length) return [{ start: 1, end: totalPages }]

    return parsed
        .map((d: any) => ({
            start: Number.isFinite(d?.start) ? Number(d.start) : parseInt(d?.start, 10),
            end: Number.isFinite(d?.end) ? Number(d.end) : parseInt(d?.end, 10),
        }))
        .filter((d: { start: number; end: number }) => Number.isFinite(d.start) && Number.isFinite(d.end))
}

// ─── Pass 1: Classify ────────────────────────────────────────────────────────

async function classifyDocument(
    base64: string, mimetype: string, model: AiModel, isPDF: boolean,
    doctypes: Array<{ id: string; label: string; definition: string; fieldDefs?: any[] }>,
    usageAccum?: AIUsage
): Promise<Array<{ id: string; start?: number; end?: number; partId?: string }>> {
    const typeList = doctypes.map(dt => {
        const base = `• ${dt.id}: ${dt.definition || dt.label}`
        if (!dt.fieldDefs?.length) return base
        const fields = JSON.stringify(dt.fieldDefs.map((f: any) => {
            const entry: any = { key: f.key, type: f.type }
            if (f.ai) entry.ai = f.ai
            return entry
        }))
        return `${base}\n  fields: ${fields}`
    }).join('\n')

    const prompt = `Identifica los tipos de documento en este archivo chileno.
Si el archivo NO corresponde a ninguno de los tipos listados abajo, devuelve {"documents":[]}.
Devuelve JSON: {"documents":[{"id":"tipo-id"${isPDF ? ',"start":1,"end":1' : ''},"partId":"front|back"}]}
${isPDF
    ? `"start"/"end": páginas 1-indexed. Si un tipo aparece múltiples veces (ej: varias liquidaciones), devuelve uno por instancia con su rango de páginas. Páginas que no correspondan a ningún tipo listado deben ignorarse.
Si una página contiene AMBAS caras de una cédula (frente y reverso), devuelve DOS elementos con la misma página y diferente partId.`
    : `Si la imagen contiene AMBAS caras de una cédula (frente y reverso apilados), devuelve DOS elementos. Para otro documento, devuelve uno solo.`
}
"partId": solo para cédula-identidad. Frente tiene foto/RUT/nombre. Reverso tiene firma/huella/profesión.
- Si no estás seguro del tipo, devuelve {"documents":[]}. Es mejor no clasificar que clasificar mal.
Tipos válidos:
${typeList}`

    const vr = await model2vision(model, mimetype, base64, prompt)
    if (usageAccum) Object.assign(usageAccum, addUsage(usageAccum, vr.usage))
    const rawDocs = parseRawDocs(vr.text)

    return rawDocs.map((d: any) => {
        const id = d?.id || d?.doctypeid || null
        const start = Number.isFinite(d?.start) ? Number(d.start) : (d?.start ? parseInt(d.start, 10) : undefined)
        const end = Number.isFinite(d?.end) ? Number(d.end) : (d?.end ? parseInt(d.end, 10) : undefined)
        const partId = d?.partId || d?.part_id || d?.partid || undefined
        return { id, ...(Number.isFinite(start) ? { start } : {}), ...(Number.isFinite(end) ? { end } : {}), ...(partId ? { partId } : {}) }
    }).filter((d: any) => d.id)
}

// ─── Single-pass: Classify + Extract for images ─────────────────────────────

async function classifyAndExtractImage(
    base64: string, mimetype: string, model: AiModel,
    doctypes: Array<{ id: string; label: string; definition: string; fieldDefs: any[] }>,
    usageAccum?: AIUsage
): Promise<any[]> {
    const typeList = doctypes.map(dt => {
        const fields = JSON.stringify(dt.fieldDefs.map((f: any) => {
            const entry: any = { key: f.key, type: f.type }
            if (f.ai) entry.ai = f.ai
            return entry
        }))
        return `• ${dt.id}: ${dt.definition || dt.label}\n  fields: ${fields}`
    }).join('\n')

    const prompt = `Identifica y extrae los campos de este documento chileno.
Si la imagen NO corresponde a ninguno de los tipos listados abajo, devuelve {"documents":[]}.
Si la imagen contiene AMBAS caras de una cédula (frente y reverso apilados), devuelve DOS elementos con "partId": "front" y "back".
Para cédula front, incluye "foto_bbox" en "data" con coordenadas (0-100%) de la foto: {x, y, width, height}. Incluye cabeza, cuello y hombros.
Devuelve JSON: {"documents":[{"id":"tipo-id","data":{...},"docdate":"YYYY-MM-DD","partId":"front|back"}]}
- "docdate": la fecha a la que CORRESPONDE la información, NO cuándo fue emitido o descargado. Ej: liquidación de junio 2025 emitida el 25 mayo → 2025-06-01. Resumen anual 2024 → 2024-01-01. Para certificados sin período (cédula, nacimiento, matrimonio), usar la fecha de emisión. Formato YYYY-MM-DD
- "partId": solo para cédula-identidad
- Campos type:"num": devuelve número entero sin separador de miles. En Chile el punto es separador de miles (NO decimal): $558.376 = 558376, $1.923 = 1923, $95.032.491 = 95032491
- No inventes datos salvo campos con instrucción "ai"
- Si no estás seguro del tipo, devuelve {"documents":[]}. Es mejor no clasificar que clasificar mal.
- Solo JSON, sin markdown
Tipos válidos:
${typeList}`

    const vr = await model2vision(model, mimetype, base64, prompt)
    if (usageAccum) Object.assign(usageAccum, addUsage(usageAccum, vr.usage))
    return parseRawDocs(vr.text)
}

// ─── Pass 2: Extract fields ──────────────────────────────────────────────────

async function extractFields(
    base64: string, mimetype: string, model: AiModel, isPDF: boolean,
    docTypeId: string, doctype: any,
    entries: Array<{ start?: number; end?: number; partId?: string }>,
    usageAccum?: AIUsage
): Promise<any[]> {
    const fields = JSON.stringify(doctype.fieldDefs.map((f: any) => {
        const entry: any = { key: f.key, type: f.type }
        if (f.ai) entry.ai = f.ai
        return entry
    }))

    const isCedula = docTypeId === 'cedula-identidad'
    const cedulaBbox = isCedula ? `
Si partId es "front", incluye "foto_bbox" en "data" con coordenadas (0-100%) de la foto: {x, y, width, height}. Incluye cabeza completa, cuello y hombros.` : ''

    const pageHint = isPDF && entries.length > 0
        ? `Documentos detectados en páginas: ${entries.map(e => e.partId ? `${e.start}-${e.end} (${e.partId})` : `${e.start}-${e.end}`).join(', ')}.`
        : ''

    const dateInstruction = doctype.dateHint
        ? `"docdate": ${doctype.dateHint}. Formato YYYY-MM-DD`
        : `"docdate": la fecha a la que CORRESPONDE la información, NO cuándo fue emitido. Para certificados sin período, usar fecha de emisión. Formato YYYY-MM-DD`

    const prompt = `Extrae los campos de "${doctype.label}" (id: "${docTypeId}").
${pageHint}
Devuelve JSON: {"documents":[{"id":"${docTypeId}","data":{...},"docdate":"YYYY-MM-DD"${isPDF ? ',"start":N,"end":N' : ''}${isCedula ? ',"partId":"front|back"' : ''}}]}
Campos: ${fields}
${cedulaBbox}
- ${dateInstruction}
- Campos type:"num": devuelve número entero sin separador de miles. En Chile el punto es separador de miles (NO decimal): $558.376 = 558376, $1.923 = 1923, $95.032.491 = 95032491
- No inventes datos salvo campos con instrucción "ai"
- Distingue entre CERTIFICADO (emitido) y FORMULARIO (para llenar)
- Solo JSON, sin markdown`

    const vr = await model2vision(model, mimetype, base64, prompt)
    if (usageAccum) Object.assign(usageAccum, addUsage(usageAccum, vr.usage))
    return parseRawDocs(vr.text)
}

// ─── Main orchestrator ───────────────────────────────────────────────────────

export async function Doc2Fields(
    buffer: Buffer,
    mimetype: string,
    model: ModelArg = 'gemini',
    forcedDoctypeId?: string,
    options?: { skipFace?: boolean }
): Promise<ExtractionResult> {
    const isImage = mimetype.startsWith('image/')
    const isPDF = mimetype === 'application/pdf'
    if (!isImage && !isPDF) throw new Error('Images and PDFs only')

    const { doctypes, mapById } = loadSchemas()
    const base64 = buffer.toString('base64')
    const aiModel = toAiModel(model)
    const usage: AIUsage = {}

    let allRawDocs: any[]

    if (forcedDoctypeId) {
        const doctype = mapById[forcedDoctypeId]
        if (!doctype) return { documents: [] }
        allRawDocs = await extractFields(base64, mimetype, aiModel, isPDF, forcedDoctypeId, doctype, [{}], usage)
    } else if (isImage) {
        allRawDocs = await classifyAndExtractImage(base64, mimetype, aiModel, doctypes, usage)
    } else {
        let classified: Array<{ id: string; start?: number; end?: number; partId?: string }>

        let totalPages = 0
        let pdfDoc: PDFDocument | null = null
        try {
            pdfDoc = await PDFDocument.load(buffer)
            totalPages = pdfDoc.getPageCount()

            if (totalPages > 1) {
                // Classify each page individually, then merge adjacent pages
                // with the same doctype into document ranges.
                // This avoids context bias where a Maat informe comercial page
                // gets misclassified as informe-deuda when grouped with debt pages.
                const perPage: Array<{ id: string; page: number; partId?: string }> = []
                for (let p = 1; p <= totalPages; p++) {
                    const out = await PDFDocument.create()
                    const [copied] = await out.copyPages(pdfDoc, [p - 1])
                    out.addPage(copied)
                    const pageBase64 = Buffer.from(await out.save()).toString('base64')

                    const pageClassified = await classifyDocument(pageBase64, mimetype, aiModel, false, doctypes, usage)
                    for (const c of pageClassified) {
                        perPage.push({ id: c.id, page: p, partId: c.partId })
                    }
                }

                // Merge adjacent pages with the same doctype into ranges
                classified = []
                for (let i = 0; i < perPage.length; i++) {
                    const entry = perPage[i]
                    // Cédula entries have partId and shouldn't be merged
                    if (entry.partId) {
                        classified.push({ id: entry.id, start: entry.page, end: entry.page, partId: entry.partId })
                        continue
                    }
                    let end = entry.page
                    while (
                        i + 1 < perPage.length &&
                        perPage[i + 1].id === entry.id &&
                        !perPage[i + 1].partId &&
                        perPage[i + 1].page === end + 1
                    ) {
                        end = perPage[i + 1].page
                        i++
                    }
                    classified.push({ id: entry.id, start: entry.page, end })
                }
            } else {
                classified = await classifyDocument(base64, mimetype, aiModel, isPDF, doctypes, usage)
            }
        } catch {
            classified = await classifyDocument(base64, mimetype, aiModel, isPDF, doctypes, usage)
        }

        if (classified.length === 0) {
            return { documents: [] }
        }

        // Ensure composite cédulas have both front and back entries
        {
            const cedulaEntries = classified.filter(c => c.id === 'cedula-identidad')
            for (const entry of cedulaEntries) {
                if (!entry.partId) entry.partId = 'front'
                if (entry.partId === 'front') {
                    const hasBack = cedulaEntries.some(c =>
                        c.partId === 'back' && c.start === entry.start && c.end === entry.end
                    )
                    if (!hasBack) {
                        classified.push({
                            id: 'cedula-identidad',
                            start: entry.start,
                            end: entry.end,
                            partId: 'back',
                        })
                    }
                }
            }
        }

        // Auto-expand multi-page entries for multi-count doctypes
        {
            const expanded: typeof classified = []
            for (const entry of classified) {
                const dt = mapById[entry.id]
                const span = (entry.start != null && entry.end != null) ? entry.end - entry.start + 1 : 1
                const isCedulaEntry = entry.id === 'cedula-identidad' && !!entry.partId
                if (dt && dt.count > 1 && span > 1 && !isCedulaEntry) {
                    for (let p = entry.start!; p <= entry.end!; p++) {
                        expanded.push({ id: entry.id, start: p, end: p })
                    }
                } else {
                    expanded.push(entry)
                }
            }
            classified = expanded
        }

        // Container document detection: if a container doctype (e.g. carpeta-tributaria)
        // is present, ensure it spans all pages and that sub-documents are identified.
        // If the AI classified all pages as the container, do a second-pass classification
        // against the contained sub-doctypes to identify page ranges for each.
        {
            const containerIds = new Set<string>()
            for (const c of classified) {
                const dt = mapById[c.id]
                if (dt?.contains?.length) containerIds.add(c.id)
            }

            for (const containerId of containerIds) {
                const containerDt = mapById[containerId]
                if (!containerDt?.contains?.length) continue
                const containedIds = new Set(containerDt.contains)

                // Check if any sub-documents were already identified by per-page classification
                const hasSubDocs = classified.some(c => containedIds.has(c.id))

                if (!hasSubDocs && totalPages > 1) {
                    // All pages classified as container — second-pass classification
                    // against contained sub-doctypes only
                    const subDoctypes = doctypes.filter(dt => containedIds.has(dt.id))
                    if (subDoctypes.length > 0) {
                        const subClassified = await classifyDocument(
                            base64, mimetype, aiModel, isPDF, subDoctypes, usage
                        )
                        for (const sub of subClassified) {
                            classified.push(sub)
                        }
                    }
                }

                // Ensure a single container entry spans all pages
                classified = classified.filter(c => c.id !== containerId)
                classified.unshift({ id: containerId, start: 1, end: totalPages })
            }
        }

        // Group by doc type for Pass 2
        const byType = new Map<string, Array<{ start?: number; end?: number; partId?: string }>>()
        for (const c of classified) {
            const existing = byType.get(c.id) || []
            existing.push({ start: c.start, end: c.end, partId: c.partId })
            byType.set(c.id, existing)
        }

        const MAX_PER_BATCH = 8
        const extractionPromises: Array<Promise<any[]>> = []

        for (const [docTypeId, entries] of byType) {
            const doctype = mapById[docTypeId]
            if (!doctype) continue

            let extractBase64 = base64
            let adjustedEntries = entries

            if (pdfDoc && totalPages > 1 && entries.every(e => e.start != null && e.end != null)) {
                const allPages = new Set<number>()
                for (const e of entries) {
                    for (let p = e.start!; p <= e.end!; p++) allPages.add(p)
                }

                if (allPages.size > 0 && allPages.size < totalPages) {
                    try {
                        const sortedPages = [...allPages].sort((a, b) => a - b)
                        const out = await PDFDocument.create()
                        const copied = await out.copyPages(pdfDoc, sortedPages.map(p => p - 1))
                        copied.forEach(p => out.addPage(p))
                        extractBase64 = Buffer.from(await out.save()).toString('base64')

                        const pageMap = new Map(sortedPages.map((orig, idx) => [orig, idx + 1]))
                        adjustedEntries = entries.map(e => ({
                            ...e,
                            start: pageMap.get(e.start!),
                            end: pageMap.get(e.end!),
                        }))
                    } catch {
                        // Fall back to full PDF
                    }
                }
            }

            if (adjustedEntries.length > MAX_PER_BATCH) {
                for (let i = 0; i < adjustedEntries.length; i += MAX_PER_BATCH) {
                    extractionPromises.push(
                        extractFields(extractBase64, mimetype, aiModel, isPDF, docTypeId, doctype, adjustedEntries.slice(i, i + MAX_PER_BATCH), usage)
                    )
                }
            } else {
                extractionPromises.push(
                    extractFields(extractBase64, mimetype, aiModel, isPDF, docTypeId, doctype, adjustedEntries, usage)
                )
            }
        }

        const extractionResults = await Promise.all(extractionPromises)

        // Post-extraction merge
        {
            const extractedByType = new Map<string, any[]>()
            for (const raw of extractionResults.flat()) {
                const n = normalizeDoc(raw)
                if (!n.id) continue
                if (!extractedByType.has(n.id)) extractedByType.set(n.id, [])
                extractedByType.get(n.id)!.push(n)
            }

            allRawDocs = []
            for (const [typeId, classEntries] of byType) {
                if (!mapById[typeId]) continue
                const sortedClass = [...classEntries].sort((a, b) => (a.start ?? 0) - (b.start ?? 0))
                const sortedExtracted = (extractedByType.get(typeId) || [])
                    .sort((a, b) => (a.start ?? 0) - (b.start ?? 0))

                for (let i = 0; i < sortedClass.length; i++) {
                    const cls = sortedClass[i]
                    const ext = i < sortedExtracted.length ? sortedExtracted[i] : null

                    allRawDocs.push({
                        id: typeId,
                        data: ext?.data || {},
                        docdate: ext?.docdate || null,
                        start: cls.start,
                        end: cls.end,
                        ...(cls.partId ? { partId: cls.partId } : {}),
                    })
                }
            }
        }
    }

    // Process documents, handling face extraction for cedulas
    const skipFace = options?.skipFace === true
    const documents = await Promise.all(allRawDocs.map(async (d: any) => {
        const { id, data, docdate, start, end, partId } = normalizeDoc(d)

        if (id === 'cedula-identidad' && partId === 'front' && !skipFace) {
            let imageBuffer: Buffer | null = null

            if (isImage) {
                imageBuffer = buffer
            } else if (isPDF && typeof start === 'number') {
                imageBuffer = await extractPdfPageAsImage(buffer, start)
            }

            if (imageBuffer) {
                const result = await extractFace(imageBuffer)
                if (result) {
                    data.foto_base64 = result.face
                }
            }
            delete data.foto_bbox
        }

        return {
            doc_type_id: id,
            label: id ? mapById?.[id]?.label || null : null,
            data,
            docdate,
            ...(Number.isFinite(start) ? { start } : {}),
            ...(Number.isFinite(end) ? { end } : {}),
            ...(partId ? { partId } : {}),
        }
    }))

    // Post-processing: move back-side fields from front to back
    for (const front of documents) {
        if (front.doc_type_id !== 'cedula-identidad' || front.partId !== 'front') continue
        const frontData = front.data as Record<string, any>
        const back = documents.find(d =>
            d.doc_type_id === 'cedula-identidad' && d.partId === 'back' &&
            d.start === front.start && d.end === front.end
        )
        if (!back) continue
        const backData = back.data as Record<string, any>

        for (const key of ['lugar_nacimiento', 'profesion'] as const) {
            if (frontData[key] && !backData[key]) {
                backData[key] = frontData[key]
                delete frontData[key]
            }
        }
        if (!back.docdate && front.docdate) back.docdate = front.docdate
    }

    const hasUsage = usage.promptTokenCount || usage.candidatesTokenCount
    return { documents, ...(hasUsage ? { usage } : {}) }
}
