import { M as ModelArg, E as ExtractionResult, C as CompositeCedulaResult, a as CedulaFile, b as MergedCedula } from './types-jOhdMz9z.mjs';
export { c as ExtractionDocument } from './types-jOhdMz9z.mjs';

interface DocProcessorLogger {
    error(error: unknown, context?: Record<string, unknown>): void;
    warn(message: string, context?: Record<string, unknown>): void;
}
declare function configure(options: {
    logger?: DocProcessorLogger;
}): void;

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
 * 3-tier fallback: Gemini bbox → smartcrop → fixed bbox
 */

/**
 * Returns a short hash that changes when doctypes schema or prompt templates change.
 * Used as part of the AI cache key.
 */
declare function getPromptVersion(): string;
/**
 * Build a cache key from the three inputs that determine AI output:
 * file content (hash), model, and prompt version.
 */
declare function buildCacheKey(fileHash: string, model: string, promptVersion: string): string;
/**
 * Extract a specific page from a PDF as a PNG image buffer
 */
declare function extractPdfPageAsImage(pdfBuffer: Buffer, pageNumber: number): Promise<Buffer | null>;
/**
 * Detect which side of a cedula is shown in an image
 */
declare function detectCedulaSide(buffer: Buffer, mimetype: string, model?: ModelArg): Promise<{
    side: 'front' | 'back' | null;
    confidence: number;
    data?: object;
}>;
declare function Doc2Fields(buffer: Buffer, mimetype: string, model?: ModelArg, forcedDoctypeId?: string): Promise<ExtractionResult>;

/**
 * Composite Cedula Detection & Splitting
 *
 * Detects images containing both sides of a Chilean ID card (front + back
 * stacked vertically) and splits them into separate card images with AI verification.
 *
 * Pure function: buffer in, result out. No DB/S3 side effects.
 */

/**
 * Detect if an image buffer contains a composite cedula (front + back stacked
 * vertically) and split it into two separate card images with AI verification.
 *
 * Pure function: buffer in, result out. No DB/S3 side effects.
 * Callers must convert PDF pages to images before calling this.
 *
 * @returns CompositeCedulaResult if composite cedula detected, null otherwise
 */
declare function detectAndSplitCompositeCedula(imageBuffer: Buffer, mimetype: string, model?: ModelArg): Promise<CompositeCedulaResult | null>;

/**
 * Merge front + back cedula files into a single personal data object.
 * Front: rut, nombres, apellidos, fecha_nacimiento, nacionalidad, foto_base64
 * Back: profesion, lugar_nacimiento
 */
declare function mergeCedulaFiles(files: CedulaFile[], logAction?: string): MergedCedula;

/** Resize an image buffer to a small JPEG thumbnail. Returns null on failure. */
declare function generateThumbnailFromImage(buffer: Buffer): Promise<Buffer | null>;
/** Render first page of a PDF to a small JPEG thumbnail. Returns null on failure. */
declare function generateThumbnailFromPdf(buffer: Buffer): Promise<Buffer | null>;

export { CedulaFile, CompositeCedulaResult, Doc2Fields, type DocProcessorLogger, ExtractionResult, MergedCedula, ModelArg, buildCacheKey, configure, detectAndSplitCompositeCedula, detectCedulaSide, extractPdfPageAsImage, generateThumbnailFromImage, generateThumbnailFromPdf, getPromptVersion, mergeCedulaFiles };
