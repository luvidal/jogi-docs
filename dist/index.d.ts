export { D as DocProcessorLogger, c as configure } from './config-CySXFcye.js';
import { G as GroundedResult, M as ModelArg, a as GeminiModels, A as AllowedDoctypeIds, E as ExtractionResult, C as CompositeCedulaResult, b as CedulaFile, c as MergedCedula } from './types-COSfEMg9.js';
export { d as AIUsage, e as ExtractScope, f as ExtractionDocument } from './types-COSfEMg9.js';

type ResponseSchema = Record<string, unknown>;
/**
 * Query Gemini with Google Search grounding enabled.
 * Used for derived fields that need real-world data (e.g., market prices).
 * Returns raw text response — caller is responsible for parsing.
 */
declare const queryGrounded: (prompt: string, options?: {
    model?: string;
}) => Promise<GroundedResult>;

/**
 * OCR and Document Field Extraction
 *
 * Extracts structured data from uploaded Chilean documents using AI vision
 * models (Gemini Flash primary, Claude Haiku fallback).
 *
 * ## Extraction Strategy
 *
 * ### Images → Split-pass (classifyDocument → extractFields)
 * Same schema contract as PDFs; images just omit page ranges.
 *
 * ### PDFs → Multi-pass (detectDocumentBoundaries → classifyDocument → extractFields)
 * Pass 0 — Split: detect document boundaries in multi-doc PDFs (no doctype knowledge)
 * Pass 1 — Classify: each document individually with doctype definitions + field schemas
 * Pass 2 — Extract: per-type field schemas, parallel across types
 *
 * ## Face Photo Extraction (Cédula)
 * AWS Rekognition via extractFace() — single call, picks largest face.
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
/**
 * Hand-written `data` object schema per doctype. Returns `null` for doctypes
 * whose data shape is still in flux — the responseSchema then falls them into
 * the no-data fallback branch.
 *
 * Properties are nullable rather than required: a single missing field on a
 * scanned document shouldn't make Gemini reject the entire response. Page
 * coverage, overlap, and per-doctype sanity stay enforced app-side.
 */
declare function buildDataSchemaForDoctype(docTypeId: string): ResponseSchema | null;
/**
 * Build the Gemini `responseSchema` for the multi-page classifier.
 *
 * Phase 1 (shape) and Phase 2 (per-doctype `data`) are folded into one
 * builder. Each branch in `documents.items.anyOf` is keyed on `id` (a
 * single-value enum acts as the discriminator):
 *
 * - Doctypes in {@link DATA_SCHEMA_DOCTYPES} get a dedicated branch with
 *   `data` (per-doctype object schema) and `docdate` (string, nullable).
 * - Every other candidate doctype shares one fallback branch with no `data`
 *   constraint — keeps the schema small and tolerant for unaudited shapes.
 *
 * Shape-level invariants (still enforced):
 * - `id` is enum-restricted to the candidate doctype list.
 * - `start`/`end` are integers (PDF only).
 * - `confidence` is required and bounded `[0,1]`.
 * - `partId` is the `front | back` enum, nullable.
 *
 * The app still independently validates page coverage, overlaps, request
 * authorization, and per-doctype sanity.
 */
declare function buildClassifyResponseSchema(doctypeIds: string[], isPDF: boolean): ResponseSchema;
declare function buildExtractResponseSchema(docTypeId: string, isPDF: boolean, entries: Array<{
    start?: number;
    end?: number;
    partId?: string;
}>): ResponseSchema | null;
declare function Doc2Fields(buffer: Buffer, mimetype: string, model?: ModelArg, forcedDoctypeId?: string, options?: {
    skipFace?: boolean;
    geminiModels?: GeminiModels;
    allowedDoctypeIds?: AllowedDoctypeIds;
}): Promise<ExtractionResult>;

/**
 * V1 Composite Cedula Detection — Pixel Heuristics (SUPERSEDED by V3)
 *
 * Detects images containing both sides of a Chilean ID card (front + back
 * stacked vertically) and splits them into separate card images with AI verification.
 *
 * Algorithm:
 *  1. Aspect ratio gate (height/width > 1.2)
 *  2. Greyscale row analysis — brightness-based gap finding (≤5% dark pixels)
 *  3. Fallback — variance-based gap finding (median × 0.15 threshold)
 *  4. Last resort — naïve 50/50 split at image midpoint
 *  5. AI verification — Doc2Fields on each half to confirm cedula
 *
 * Limitations that led to V3:
 *  - Dark backgrounds defeat brightness-based gap detection
 *  - Angled/rotated photos have no clean horizontal gap
 *  - Shadows, fingers, or objects between cards create false gaps
 *  - Side-by-side layouts rejected by aspect ratio gate
 *  - 50/50 fallback almost always crops through the card
 *  - Each heuristic fix broke other edge cases (whack-a-mole)
 *
 * Superseded by: cedulasplit.ts (V3) — AI bounding box detection.
 * Kept for reference. See also: faceextract.ts (V2, front-card-only).
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
 * V3 Composite Cedula Detection — AI Bounding Boxes
 *
 * Sends the full image to an AI vision model and asks it to locate
 * both the front and back cards as percentage-based bounding boxes.
 * Crops with sharp, then runs Doc2Fields for field extraction.
 *
 * Replaces V1 (cedula.ts) which used pixel-level row heuristics
 * (brightness/variance gap-finding) that broke on dark backgrounds,
 * angled photos, shadows, overlapping cards, and non-standard layouts.
 *
 * Inspired by V2 (faceextract.ts) which proved AI bounding boxes work
 * for locating the front card. V3 extends that to both cards.
 *
 * Key differences from V1:
 *  - No aspect ratio gate — the AI decides if the image is composite
 *  - No pixel heuristics — no findBestSplit, no brightness/variance
 *  - No 50/50 fallback — if AI can't find two cards, returns null
 *  - Uses model2vision() from ai.ts (multi-model fallback + retry)
 *
 * Pure function: buffer in, result out. No DB/S3 side effects.
 */

/**
 * Detect if an image contains a composite cedula (front + back) and split
 * it into two separate card images with AI-extracted fields.
 *
 * Pure function: buffer in, result out. No DB/S3 side effects.
 * Callers must convert PDF pages to images before calling this.
 *
 * @returns CompositeCedulaResult if composite cedula detected, null otherwise
 */
declare function detectAndSplitCompositeCedulaV3(imageBuffer: Buffer, mimetype: string, model?: ModelArg): Promise<CompositeCedulaResult | null>;

/**
 * V4 Face/Avatar Extraction — AWS Rekognition
 *
 * Extracts a face from ANY image using AWS Rekognition DetectFaces.
 * Purpose-built ML face detection — not an LLM guessing coordinates.
 * Returns precise bounding boxes with confidence scores.
 * Picks the LARGEST face → always the passport photo, never the ghost.
 *
 * Pure function: buffer in, base64 face out. No DB/S3 writes.
 * 1 Rekognition API call (~$0.001/image).
 */
interface BBox {
    x: number;
    y: number;
    width: number;
    height: number;
}
interface FaceExtractionResult {
    /** Base64-encoded 256×256 JPEG of the face */
    face: string;
    /** Bounding box as percentage coordinates (0–100) */
    bbox: BBox;
    /** Rekognition confidence score (0–100) */
    confidence: number;
    /** Number of faces detected in the image */
    facesDetected: number;
}
interface ExtractFaceOptions {
    /** AWS region (default: us-east-1) */
    region?: string;
    /** AWS credentials — if omitted, uses env/default chain */
    credentials?: {
        accessKeyId: string;
        secretAccessKey: string;
    };
}
/**
 * Extract a face/avatar from any image using AWS Rekognition.
 *
 * 1 API call to detect all faces, picks the largest, crops + resizes to 256×256.
 */
declare function extractFace(imageBuffer: Buffer, _mimetype?: string, _model?: string, opts?: ExtractFaceOptions): Promise<FaceExtractionResult | null>;

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

export { AllowedDoctypeIds, CedulaFile, CompositeCedulaResult, Doc2Fields, ExtractionResult, type FaceExtractionResult, GroundedResult, MergedCedula, ModelArg, buildCacheKey, buildClassifyResponseSchema, buildDataSchemaForDoctype, buildExtractResponseSchema, detectAndSplitCompositeCedula, detectAndSplitCompositeCedulaV3, detectCedulaSide, extractFace, extractPdfPageAsImage, generateThumbnailFromImage, generateThumbnailFromPdf, getPromptVersion, mergeCedulaFiles, queryGrounded };
