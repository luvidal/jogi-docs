# @avd/docprocessor

Chilean document processing module — classification, field extraction, face detection, and image utilities.

## Architecture

Two separate AI services handle different concerns:

### OCR / Classification — Gemini

All text recognition and document understanding goes through Google Gemini (Flash).

- **Input**: PDF or image buffer + mimetype
- **Output**: Structured JSON — doctype ID, field values (names, dates, RUT, etc.), page ranges for multi-doc PDFs
- **Entry point**: `Doc2Fields(buffer, mimetype, model?, forcedDoctypeId?, options?)`

Gemini reads the document, classifies it against the doctype taxonomy (`data/doctypes.json`), and extracts fields defined in each doctype's schema.

### Face Detection — AWS Rekognition

Face extraction uses AWS Rekognition `DetectFaces` — purpose-built ML, not an LLM guessing coordinates.

- **Input**: Image buffer (any format sharp can read)
- **Output**: 256x256 JPEG base64 of the cropped face, or `null`
- **Entry point**: `extractFace(buffer, mimetype?)`

Simple pipeline: Rekognition returns face bounding box → tuned geometry (1.3x padding, 55% vertical offset) → sharp crop + resize to 256x256 JPEG.

No prompt tuning needed. Works on cedula photos, passport photos, any image with a face.

### How they connect

For cedula processing, both services run but are kept separate:

1. `Doc2Fields(frontBuf, mimetype, model, undefined, { skipFace: true })` — Gemini extracts text fields only
2. `extractFace(frontBuf)` — Rekognition extracts the face photo
3. Results are merged: `frontData.foto_base64 = faceResult.face`

The `skipFace` option prevents Doc2Fields from running its own face extraction, so the caller controls which face extraction path is used.

## Source Files

| File | Purpose | AI Service |
|------|---------|------------|
| `src/ocr.ts` | Doc2Fields — classification + field extraction | Gemini |
| `src/faceextract.ts` | extractFace — face detection + crop | AWS Rekognition |
| `src/ai.ts` | AI client init (Gemini, Claude, OpenAI) | — |
| `src/cedulasplit.ts` | V3 composite cedula detection (front+back → split) | Gemini + Rekognition |
| `src/cedula.ts` | V1 composite detection (superseded by V3) | Gemini |
| `src/cedulamerge.ts` | Merge front/back cedula data into single record | — |
| `src/thumbnail.ts` | Image/PDF thumbnail generation | — |
| `src/doctypes.ts` | Doctype taxonomy loader | — |
| `src/multipart.ts` | Multi-part document utilities | — |
| `src/config.ts` | Pluggable logger, configure() | — |
| `src/utils.ts` | Shared helpers | — |
| `src/types.ts` | TypeScript types | — |

## Entry Points

| Import | Use case | Heavy deps? |
|--------|----------|-------------|
| `@avd/docprocessor` | Server-only: AI extraction, cedula, thumbnails | Yes (sharp, AI SDKs, pdf-lib) |
| `@avd/docprocessor/doctypes` | Universal: doctype queries, types | No |
| `@avd/docprocessor/multipart` | Universal: multi-part file utilities | No |

## Key Exports

```typescript
// Classification + extraction
Doc2Fields(buffer, mimetype, model?, forcedDoctypeId?, options?)

// Face detection
extractFace(buffer, mimetype?)

// Composite cedula
detectAndSplitCompositeCedulaV3(imageBuffer, mimetype, model?)

// Cedula merge
mergeCedulaFiles(files)

// PDF utilities
extractPdfPageAsImage(pdfBuffer, pageNumber)

// Thumbnails
generateThumbnailFromImage(buffer, mimetype)
generateThumbnailFromPdf(buffer)

// Config
configure({ logger })
getPromptVersion()
buildCacheKey(hash, model, promptVersion)
```

## Environment Variables

- `GEMINI_API_KEY` — Google Gemini (required for classification)
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` — AWS Rekognition (required for face detection)
- `ANTHROPIC_API_KEY` — Claude fallback (optional)
- `OPENAI_API_KEY` — GPT fallback (optional)

## Development

```bash
npm run build    # tsup build → dist/
npm run test     # vitest
```

Built output (`dist/`) is committed since the package is consumed via GitHub, not npm registry.
