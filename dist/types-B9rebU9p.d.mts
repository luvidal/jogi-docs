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
interface ExtractionDocument {
    doc_type_id: string | null;
    label: string | null;
    data: object;
    docdate: string | null;
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

export type { AIUsage as A, CompositeCedulaResult as C, DocFrequency as D, ExtractionResult as E, FieldDef as F, GroundedResult as G, HowToObtain as H, ModelArg as M, CedulaFile as a, MergedCedula as b, ExtractionDocument as c, Doctype as d, DoctypeField as e, DoctypesMap as f, DocRequirement as g, MultiPartConfig as h };
