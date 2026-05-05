// Server-only entry point — contains heavy deps (sharp, AI SDKs, pdf-lib)
// For doctype utilities without heavy deps, use @jogi/docprocessor/doctypes

export { configure } from './config'
export type { DocProcessorLogger } from './config'

// OCR / Extraction
export { Doc2Fields, detectCedulaSide, extractPdfPageAsImage, getPromptVersion, buildCacheKey, buildClassifyResponseSchema, buildDataSchemaForDoctype } from './ocr'

// Grounded AI queries (for derived fields)
export { queryGrounded } from './ai'

// Composite cedula detection
export { detectAndSplitCompositeCedula } from './cedula'
export { detectAndSplitCompositeCedulaV3 } from './cedulasplit'

// Face extraction
export { extractFace } from './faceextract'
export type { FaceExtractionResult } from './faceextract'

// Cedula merge
export { mergeCedulaFiles } from './cedulamerge'

// Thumbnail generation (pure, no S3)
export { generateThumbnailFromImage, generateThumbnailFromPdf } from './thumbnail'

// Types
export type {
  ModelArg,
  AIUsage,
  ExtractionResult,
  ExtractionDocument,
  GroundedResult,
  CompositeCedulaResult,
  CedulaFile,
  MergedCedula,
  AllowedDoctypeIds,
  ExtractScope,
} from './types'
