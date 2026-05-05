interface HowToObtain {
    steps: string[];
    tips?: string[];
}
interface FieldDef {
    key: string;
    type: 'string' | 'date' | 'month' | 'time' | 'num' | 'bool' | 'list' | 'obj';
    internal?: boolean;
    ai?: string;
}
type DocFrequency = 'once' | 'monthly' | 'annual';
interface DoctypeField {
    [key: string]: string | number | boolean | object | any[] | null;
}
interface Doctype {
    label: string;
    shortLabel?: string;
    category?: string;
    freq: DocFrequency;
    count: number;
    maxAge?: number;
    graceDays?: number;
    hasFechaVencimiento: boolean;
    multiInstance?: boolean;
    parts?: string[];
    contains?: string[];
    definition: string;
    dateHint?: string;
    instructions: string;
    fields: DoctypeField;
    fieldDefs: FieldDef[];
    internalFields: Set<string>;
    howToObtain?: HowToObtain;
}
type DoctypesMap = Record<string, Doctype>;
interface DocRequirement {
    freq: DocFrequency;
    count: number;
}
interface MultiPartConfig {
    enabled: boolean;
    parts: Array<{
        id: string;
        label: string;
    }>;
}
type ModelArg = 'claude' | 'gpt5' | 'gemini';
/** Per-phase Gemini model overrides. Only consulted on the GEMINI route. */
interface GeminiModels {
    /** Classification call (split-model mode). E.g. `'gemini-2.5-pro'`. */
    classify?: string;
    /** Field-extraction call. E.g. `'gemini-2.5-flash-lite'` (default). */
    extract?: string;
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
type AllowedDoctypeIds = string[];
interface ExtractionDocument {
    doc_type_id: string | null;
    label: string | null;
    data: object;
    docdate: string | null;
    /** Self-reported classifier confidence (0.0-1.0). Absent for forced-doctype. */
    confidence?: number;
    start?: number;
    end?: number;
    partId?: string;
}
interface AIUsage {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
}
interface ExtractionResult {
    documents: ExtractionDocument[];
    usage?: AIUsage;
}
interface GroundedResult {
    text: string;
    usage?: AIUsage;
}
interface CompositeCedulaResult {
    parts: Array<{
        partId: 'front' | 'back';
        buffer: Buffer;
        aiFields: string;
        aiDate: Date | null;
        docdate: string | null;
    }>;
}
interface CedulaFile {
    ai_fields: string | null;
    filename: string | null;
}
interface MergedCedula {
    nombres_apellidos: string;
    cedula_identidad: string;
    fecha_nacimiento: string;
    nacionalidad: string;
    profesion: string;
    lugar_nacimiento: string;
    foto_base64: string | null;
}

export type { AllowedDoctypeIds as A, CompositeCedulaResult as C, DocFrequency as D, ExtractionResult as E, FieldDef as F, GroundedResult as G, HowToObtain as H, ModelArg as M, GeminiModels as a, CedulaFile as b, MergedCedula as c, AIUsage as d, ExtractionDocument as e, Doctype as f, DoctypeField as g, DoctypesMap as h, DocRequirement as i, MultiPartConfig as j };
