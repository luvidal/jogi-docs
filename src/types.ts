// ── Doctype Types ──

export interface HowToObtain {
  steps: string[]
  tips?: string[]
}

export interface FieldDef {
  key: string
  type: 'string' | 'date' | 'month' | 'time' | 'num' | 'bool' | 'list' | 'obj'
  internal?: boolean
  ai?: string
}

export type DocFrequency = 'once' | 'monthly' | 'annual'

export interface DoctypeField {
  [key: string]: string | number | boolean | object | any[] | null
}

export interface Doctype {
  label: string
  shortLabel?: string
  category?: string
  freq: DocFrequency
  count: number
  maxAge?: number
  graceDays?: number
  hasFechaVencimiento: boolean
  multiInstance?: boolean
  parts?: string[]
  contains?: string[]
  definition: string
  dateHint?: string
  instructions: string
  fields: DoctypeField
  fieldDefs: FieldDef[]
  internalFields: Set<string>
  howToObtain?: HowToObtain
}

export type DoctypesMap = Record<string, Doctype>

export interface DocRequirement {
  freq: DocFrequency
  count: number
}

// ── Multi-Part Types ──

export interface MultiPartConfig {
  enabled: boolean
  parts: Array<{ id: string; label: string }>
}

// ── OCR / Extraction Types ──

export type ModelArg = 'claude' | 'gpt5' | 'gemini'

/** Per-phase Gemini model overrides. Only consulted on the GEMINI route. */
export interface GeminiModels {
  /** Classification call (split-model mode). E.g. `'gemini-2.5-pro'`. */
  classify?: string
  /** Field-extraction call. E.g. `'gemini-2.5-flash-lite'` (default). */
  extract?: string
}

/**
 * Optional candidate doctype set for the classifier (Phase 7a — request-context
 * narrowing). When provided and non-empty, the multi-page / single-page classify
 * `responseSchema` enum is restricted to these ids — the model can only return
 * doctypes from this list. Forced-doctype path is unaffected (the forced id
 * always wins; no classification happens). When omitted or empty, the classifier
 * sees the full doctype catalog (unchanged legacy behavior).
 *
 * Multipart `partId` is a property of a doctype, not a separate doctype, so it
 * does not enter this set. Container narrowing (Phase 7b) reuses the same
 * mechanism with `parent.contains` as the candidate set.
 */
export type AllowedDoctypeIds = string[]

export interface ExtractionDocument {
  doc_type_id: string | null
  label: string | null
  data: object
  docdate: string | null
  /** Self-reported classifier confidence (0.0-1.0). Absent for forced-doctype. */
  confidence?: number
  start?: number
  end?: number
  partId?: string
}

export interface AIUsage {
  promptTokenCount?: number
  candidatesTokenCount?: number
}

export interface ExtractionResult {
  documents: ExtractionDocument[]
  usage?: AIUsage
}

export interface GroundedResult {
  text: string
  usage?: AIUsage
}

// ── Cedula Types ──

export interface CompositeCedulaResult {
  parts: Array<{
    partId: 'front' | 'back'
    buffer: Buffer
    aiFields: string
    aiDate: Date | null
    docdate: string | null
  }>
}

export interface CedulaFile {
  ai_fields: string | null
  filename: string | null
}

export interface MergedCedula {
  nombres_apellidos: string
  cedula_identidad: string
  fecha_nacimiento: string
  nacionalidad: string
  profesion: string
  lugar_nacimiento: string
  foto_base64: string | null
}
