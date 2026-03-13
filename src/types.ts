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

export interface ExtractionDocument {
  doc_type_id: string | null
  label: string | null
  data: object
  docdate: string | null
  start?: number
  end?: number
  partId?: string
}

export interface ExtractionResult {
  documents: ExtractionDocument[]
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
