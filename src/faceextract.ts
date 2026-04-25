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

import sharp from 'sharp'
import { RekognitionClient, DetectFacesCommand } from '@aws-sdk/client-rekognition'
import { getLogger } from './config'

interface BBox {
  x: number
  y: number
  width: number
  height: number
}

export interface FaceExtractionResult {
  /** Base64-encoded 256×256 JPEG of the face */
  face: string
  /** Bounding box as percentage coordinates (0–100) */
  bbox: BBox
  /** Rekognition confidence score (0–100) */
  confidence: number
  /** Number of faces detected in the image */
  facesDetected: number
}

export interface ExtractFaceOptions {
  /** AWS region (default: us-east-1) */
  region?: string
  /** AWS credentials — if omitted, uses env/default chain */
  credentials?: {
    accessKeyId: string
    secretAccessKey: string
  }
}

let _client: RekognitionClient | null = null

function getClient(opts?: ExtractFaceOptions): RekognitionClient {
  if (_client) return _client
  _client = new RekognitionClient({
    region: opts?.region || process.env.AWS_REGION || 'us-east-1',
    ...(opts?.credentials ? { credentials: opts.credentials } : {}),
  })
  return _client
}

/**
 * Extract a face/avatar from any image using AWS Rekognition.
 *
 * 1 API call to detect all faces, picks the largest, crops + resizes to 256×256.
 */
export async function extractFace(
  imageBuffer: Buffer,
  _mimetype?: string,
  _model?: string,
  opts?: ExtractFaceOptions,
): Promise<FaceExtractionResult | null> {
  const log = getLogger()

  // Normalize EXIF orientation: Rekognition auto-reads EXIF, sharp does not.
  // Without this, phone photos with a rotation tag produce a bbox in rotated
  // coordinates but an extract() in stored (unrotated) pixels → "bad extract area".
  const oriented = await sharp(imageBuffer).rotate().toBuffer()
  const metadata = await sharp(oriented).metadata()
  const imgW = metadata.width || 0
  const imgH = metadata.height || 0
  if (!imgW || !imgH) return null

  // Step 1: Detect faces with Rekognition
  const client = getClient(opts)
  let faces: { bbox: BBox; confidence: number; area: number }[]
  try {
    const cmd = new DetectFacesCommand({
      Image: { Bytes: oriented },
      Attributes: ['DEFAULT'],
    })
    const res = await client.send(cmd)
    const details = res.FaceDetails || []

    if (details.length === 0) return null

    // Convert Rekognition BBox (0-1 fractions) to our format (0-100 percentages)
    faces = details.map(d => {
      const bb = d.BoundingBox!
      const x = (bb.Left || 0) * 100
      const y = (bb.Top || 0) * 100
      const width = (bb.Width || 0) * 100
      const height = (bb.Height || 0) * 100
      return {
        bbox: { x, y, width, height },
        confidence: d.Confidence || 0,
        area: width * height,
      }
    })
  } catch (err) {
    log.error(err, { module: 'face-extract-v4', action: 'rekognition-detect' })
    return null
  }

  // Step 2: Pick the largest face
  faces.sort((a, b) => b.area - a.area)
  const best = faces[0]

  // Step 3: Square avatar crop centered on the face (full head: hair to chin)
  // bbox is in % of image dimensions. Convert face center to pixels.
  const faceCX = Math.round(((best.bbox.x + best.bbox.width / 2) / 100) * imgW)
  const faceCY = Math.round(((best.bbox.y + best.bbox.height / 2) / 100) * imgH)
  const faceH = Math.round((best.bbox.height / 100) * imgH)

  // Square side in pixels: face height * 1.3 for hair + chin room
  const side = Math.min(Math.round(faceH * 1.3), imgW, imgH)

  // Desired crop position: centered on face, shifted up 8% for hair
  const dLeft = faceCX - Math.floor(side / 2)
  const dTop = faceCY - Math.floor(side * 0.55)

  // Extend image if crop goes beyond edges (keeps face centered)
  const extL = Math.max(0, -dLeft)
  const extT = Math.max(0, -dTop)
  const extR = Math.max(0, dLeft + side - imgW)
  const extB = Math.max(0, dTop + side - imgH)

  if (side <= 10) return null

  // Defensive clamp: sharp.extract rejects any rectangle that falls outside
  // the (extended) image by a single pixel. Rekognition occasionally returns
  // bboxes that extend past image bounds (e.g. faces clipped at the edge),
  // which combined with integer rounding above can push `left + width` or
  // `top + height` one pixel past the extended frame. Clamp both the origin
  // and the size to the real extended dimensions and bail out if what's left
  // is too small to be a useful avatar.
  const extW = imgW + extL + extR
  const extH = imgH + extT + extB
  const cropLeft = Math.max(0, Math.min(dLeft + extL, extW - 1))
  const cropTop = Math.max(0, Math.min(dTop + extT, extH - 1))
  const cropW = Math.max(0, Math.min(side, extW - cropLeft))
  const cropH = Math.max(0, Math.min(side, extH - cropTop))
  if (cropW < 32 || cropH < 32) return null

  // Step 4: Extend → extract → resize to 256×256
  //
  // IMPORTANT: extend + extract must run in TWO separate sharp pipelines.
  // Chained in one toBuffer call, libvips' lazy evaluation can apply
  // extract against the pre-extend dimensions — so even when the rect is
  // mathematically inside the extended frame (verified by the clamp
  // above) sharp still throws "extract_area: bad extract area". Forcing
  // a buffer between the two ops eliminates that ambiguity.
  let face: string
  try {
    const needsExtend = extL || extR || extT || extB
    const extended = needsExtend
      ? await sharp(oriented)
          .extend({ top: extT, bottom: extB, left: extL, right: extR, background: '#FFFFFF' })
          .toBuffer()
      : oriented

    const photo = await sharp(extended)
      .extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH })
      .resize(256, 256)
      .jpeg({ quality: 92 })
      .toBuffer()

    if (photo.length < 5000) return null
    face = photo.toString('base64')
  } catch (err) {
    log.error(err, {
      module: 'face-extract-v4',
      action: 'crop',
      // Surface the rect + frame so the next failure is diagnosable
      // without having to reproduce locally.
      imgW, imgH, extL, extR, extT, extB, extW, extH,
      cropLeft, cropTop, cropW, cropH, side,
      bbox: best.bbox,
    })
    return null
  }

  return {
    face,
    bbox: best.bbox,
    confidence: best.confidence,
    facesDetected: faces.length,
  }
}
