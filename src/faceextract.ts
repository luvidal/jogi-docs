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

  const metadata = await sharp(imageBuffer).metadata()
  const imgW = metadata.width || 0
  const imgH = metadata.height || 0
  if (!imgW || !imgH) return null

  // Step 1: Detect faces with Rekognition
  const client = getClient(opts)
  let faces: { bbox: BBox; confidence: number; area: number }[]
  try {
    const cmd = new DetectFacesCommand({
      Image: { Bytes: imageBuffer },
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

  // Step 3: Crop with generous padding for portrait-style avatar framing
  // PAD is % of image dimensions added around the face bounding box
  const PAD = 8
  let px = Math.max(0, best.bbox.x - PAD)
  let py = Math.max(0, best.bbox.y - PAD)
  let pw = Math.min(best.bbox.width + PAD * 2, 100 - px)
  let ph = Math.min(best.bbox.height + PAD * 2, 100 - py)

  // Make the crop region square (prevents fit:'cover' from cropping the padding)
  if (pw > ph) {
    const diff = pw - ph
    py = Math.max(0, py - diff / 2)
    ph = Math.min(pw, 100 - py)
  } else if (ph > pw) {
    const diff = ph - pw
    px = Math.max(0, px - diff / 2)
    pw = Math.min(ph, 100 - px)
  }

  const left = Math.max(0, Math.round((px / 100) * imgW))
  const top = Math.max(0, Math.round((py / 100) * imgH))
  const width = Math.min(Math.round((pw / 100) * imgW), imgW - left)
  const height = Math.min(Math.round((ph / 100) * imgH), imgH - top)

  if (width <= 10 || height <= 10) return null

  // Step 4: Crop and resize to 256×256 avatar
  let face: string
  try {
    const photo = await sharp(imageBuffer)
      .extract({ left, top, width, height })
      .resize(256, 256, { fit: 'cover' })
      .jpeg({ quality: 92 })
      .toBuffer()

    if (photo.length < 5000) return null
    face = photo.toString('base64')
  } catch (err) {
    log.error(err, { module: 'face-extract-v4', action: 'crop' })
    return null
  }

  return {
    face,
    bbox: best.bbox,
    confidence: best.confidence,
    facesDetected: faces.length,
  }
}
