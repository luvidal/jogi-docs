export { c as configure } from '../config-CySXFcye.js';
import { D as DocFrequency, e as Doctype, f as DoctypeField, g as DoctypesMap, h as DocRequirement } from '../types-BXLXofc-.js';
export { F as FieldDef, H as HowToObtain } from '../types-BXLXofc-.js';

/**
 * Document types helper library
 * Reads from host-provided doctypes data (injected via configure({ doctypes }))
 */

declare function getDoctypesMap(): DoctypesMap;
declare function getDoctypes(): Array<Doctype & {
    id: string;
}>;
declare function getDoctype(id: string): (Doctype & {
    id: string;
}) | null;
declare function getDoctypeIds(): string[];
declare function isDoctypeValid(id: string): boolean;
declare function isMultiInstanceDocType(id: string): boolean;
declare function getDoctypesLegacyFormat(): Array<{
    id: string;
    label: string;
    definition: string;
    instructions: string;
    fields: DoctypeField;
    category?: string;
    multiInstance?: boolean;
}>;
declare function getDoctypesByCategory(category: string): Array<Doctype & {
    id: string;
}>;
declare function getCategories(): string[];
declare function getInternalFieldKeys(doctypeId: string): string[];
declare function getDocumentDefaults(doctypeid: string): DocRequirement;
declare function isRecurring(doctypeid: string): boolean;
declare function applyDefaults(requirements: Record<string, {
    freq?: string;
    count?: number;
}>): Record<string, {
    freq: DocFrequency;
    count: number;
}>;

export { DocFrequency, DocRequirement, Doctype, DoctypeField, DoctypesMap, applyDefaults, getCategories, getDoctype, getDoctypeIds, getDoctypes, getDoctypesByCategory, getDoctypesLegacyFormat, getDoctypesMap, getDocumentDefaults, getInternalFieldKeys, isDoctypeValid, isMultiInstanceDocType, isRecurring };
