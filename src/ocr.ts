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
 * ### PDFs → Two-pass (classifyDocument → extractFields)
 * Pass 1 — Classify: doctype IDs + definitions only (~750 tokens)
 * Pass 2 — Extract: per-type field schemas, parallel across types
 *
 * ## Face Photo Extraction (Cédula)
 * AWS Rekognition via extractFace() — single call, picks largest face.
 */

import { model2vision } from './ai'
import { getDoctypes, getDoctypesMap } from './doctypes'
import { getLogger } from './config'
import { PDFDocument } from 'pdf-lib'
import { extractFace } from './faceextract'
import sharp from 'sharp'
import { createHash } from 'crypto'
import type { ModelArg, ExtractionResult } from './types'

// ─── Cache Helpers ───────────────────────────────────────────────────────────

// Bump this string whenever prompt templates change (classifyDocument, classifyAndExtractImage, extractFields)
const PROMPT_TEMPLATE_VERSION = 'v2'

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
    let text = await model2vision(aiModel as any, mimetype, base64, prompt)
    text = text.replace(/```json|```/g, '').trim()

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
    const docdate = d?.docdate || d?.document_date || d?.documentDate || null
    const start = Number.isFinite(d?.start) ? Number(d.start) : (d?.start ? parseInt(d.start, 10) : undefined)
    const end = Number.isFinite(d?.end) ? Number(d.end) : (d?.end ? parseInt(d.end, 10) : undefined)
    const partId = d?.partId || d?.part_id || d?.partid || undefined
    return { id, data, docdate, start, end, partId }
}

// ─── Pass 1: Classify ────────────────────────────────────────────────────────

async function classifyDocument(
    base64: string, mimetype: string, model: AiModel, isPDF: boolean,
    doctypes: Array<{ id: string; label: string; definition: string }>
): Promise<Array<{ id: string; start?: number; end?: number; partId?: string }>> {
    const typeList = doctypes.map(dt => `• ${dt.id}: ${dt.definition || dt.label}`).join('\n')

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

    const text = await model2vision(model, mimetype, base64, prompt)
    const rawDocs = parseRawDocs(text)

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
    doctypes: Array<{ id: string; label: string; definition: string; fieldDefs: any[] }>
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
- No inventes datos salvo campos con instrucción "ai"
- Si no estás seguro del tipo, devuelve {"documents":[]}. Es mejor no clasificar que clasificar mal.
- Solo JSON, sin markdown
Tipos válidos:
${typeList}`

    const text = await model2vision(model, mimetype, base64, prompt)
    return parseRawDocs(text)
}

// ─── Pass 2: Extract fields ──────────────────────────────────────────────────

async function extractFields(
    base64: string, mimetype: string, model: AiModel, isPDF: boolean,
    docTypeId: string, doctype: any,
    entries: Array<{ start?: number; end?: number; partId?: string }>
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
- No inventes datos salvo campos con instrucción "ai"
- Distingue entre CERTIFICADO (emitido) y FORMULARIO (para llenar)
- Solo JSON, sin markdown`

    const text = await model2vision(model, mimetype, base64, prompt)
    return parseRawDocs(text)
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

    let allRawDocs: any[]

    if (forcedDoctypeId) {
        const doctype = mapById[forcedDoctypeId]
        if (!doctype) return { documents: [] }
        allRawDocs = await extractFields(base64, mimetype, aiModel, isPDF, forcedDoctypeId, doctype, [{}])
    } else if (isImage) {
        allRawDocs = await classifyAndExtractImage(base64, mimetype, aiModel, doctypes)
    } else {
        const CHUNK_THRESHOLD = 8
        const CHUNK_SIZE = 6
        let classified: Array<{ id: string; start?: number; end?: number; partId?: string }>

        let totalPages = 0
        let pdfDoc: PDFDocument | null = null
        try {
            pdfDoc = await PDFDocument.load(buffer)
            totalPages = pdfDoc.getPageCount()

            if (totalPages > CHUNK_THRESHOLD) {
                classified = []
                for (let chunkStart = 1; chunkStart <= totalPages; chunkStart += CHUNK_SIZE) {
                    const chunkEnd = Math.min(chunkStart + CHUNK_SIZE - 1, totalPages)
                    const indices = Array.from({ length: chunkEnd - chunkStart + 1 }, (_v, i) => chunkStart + i - 1)
                    const out = await PDFDocument.create()
                    const copied = await out.copyPages(pdfDoc, indices)
                    copied.forEach(p => out.addPage(p))
                    const chunkBytes = await out.save()
                    const chunkBase64 = Buffer.from(chunkBytes).toString('base64')

                    const chunkClassified = await classifyDocument(chunkBase64, mimetype, aiModel, isPDF, doctypes)

                    const offset = chunkStart - 1
                    for (const c of chunkClassified) {
                        if (c.start != null) c.start += offset
                        if (c.end != null) c.end += offset
                        if (c.start != null && c.start < chunkStart) c.start = chunkStart
                        if (c.end != null && c.end > chunkEnd) c.end = chunkEnd
                        classified.push(c)
                    }
                }
            } else {
                classified = await classifyDocument(base64, mimetype, aiModel, isPDF, doctypes)
            }
        } catch {
            classified = await classifyDocument(base64, mimetype, aiModel, isPDF, doctypes)
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

            if (pdfDoc && totalPages > CHUNK_THRESHOLD && entries.every(e => e.start != null && e.end != null)) {
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
                        extractFields(extractBase64, mimetype, aiModel, isPDF, docTypeId, doctype, adjustedEntries.slice(i, i + MAX_PER_BATCH))
                    )
                }
            } else {
                extractionPromises.push(
                    extractFields(extractBase64, mimetype, aiModel, isPDF, docTypeId, doctype, adjustedEntries)
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

    return { documents }
}
