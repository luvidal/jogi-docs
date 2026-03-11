// Universal entry point — no heavy deps (no sharp, no AI SDKs)
// Safe to import from frontend code

export {
  getDoctypesMap,
  getDoctypes,
  getDoctype,
  getDoctypeIds,
  isDoctypeValid,
  isMultiInstanceDocType,
  getDoctypesLegacyFormat,
  getDoctypesByCategory,
  getCategories,
  getInternalFieldKeys,
  getDocumentDefaults,
  isRecurring,
  applyDefaults,
} from '../doctypes'

export type {
  HowToObtain,
  FieldDef,
  DocFrequency,
  DoctypeField,
  Doctype,
  DoctypesMap,
  DocRequirement,
} from '../types'
