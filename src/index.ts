// Server-only entry point — contains heavy deps (sharp, AI SDKs, pdf-lib)
// For doctype utilities without heavy deps, use @avd/docprocessor/doctypes

export { configure } from './config'
export type { DocProcessorLogger } from './config'

// OCR / Extraction
export { Doc2Fields, detectCedulaSide, extractPdfPageAsImage, getPromptVersion, buildCacheKey } from './ocr'

// Composite cedula detection
export { detectAndSplitCompositeCedula } from './cedula'
export { detectAndSplitCompositeCedulaV3 } from './cedulasplit'

// Cedula merge
export { mergeCedulaFiles } from './cedulamerge'

// Thumbnail generation (pure, no S3)
export { generateThumbnailFromImage, generateThumbnailFromPdf } from './thumbnail'

// Types
export type {
  ModelArg,
  ExtractionResult,
  ExtractionDocument,
  CompositeCedulaResult,
  CedulaFile,
  MergedCedula,
} from './types'
