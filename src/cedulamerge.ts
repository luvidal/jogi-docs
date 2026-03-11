import { safeJsonParse } from './utils'
import { getPartIdFromFilename } from './multipart'
import type { CedulaFile, MergedCedula } from './types'

export type { CedulaFile, MergedCedula }

const CEDULA_FRONT_FIELDS = ['rut', 'nombres', 'apellidos', 'fecha_nacimiento', 'nacionalidad', 'foto_base64']
const CEDULA_BACK_FIELDS = ['profesion', 'lugar_nacimiento']
const CEDULA_FIELDS = [...CEDULA_FRONT_FIELDS, ...CEDULA_BACK_FIELDS]

const isFormattedRut = (v: any) => typeof v === 'string' && /\d{1,2}\.\d{3}\.\d{3}-[\dkK]/.test(v)

/**
 * Merge front + back cedula files into a single personal data object.
 * Front: rut, nombres, apellidos, fecha_nacimiento, nacionalidad, foto_base64
 * Back: profesion, lugar_nacimiento
 */
export function mergeCedulaFiles(files: CedulaFile[], logAction = 'parse_cedula'): MergedCedula {
  const merged: Record<string, any> = {}

  for (const f of files) {
    if (!f.ai_fields) continue
    const parsed = typeof f.ai_fields === 'string'
      ? safeJsonParse<any>(f.ai_fields, { module: 'situation', action: logAction })
      : f.ai_fields
    const d = (parsed as any)?.data || parsed || {}
    const partId = f.filename ? getPartIdFromFilename(f.filename) : null

    const allow = (field: string) =>
      !partId ||
      (partId === 'front' && CEDULA_FRONT_FIELDS.includes(field)) ||
      (partId === 'back' && CEDULA_BACK_FIELDS.includes(field))

    for (const field of CEDULA_FIELDS) {
      if (!allow(field) || !d[field]) continue
      if (field === 'rut') {
        if (!merged.rut || (!isFormattedRut(merged.rut) && isFormattedRut(d.rut))) merged.rut = d.rut
      } else if (!merged[field]) {
        merged[field] = d[field]
      }
    }
  }

  return {
    nombres_apellidos: [merged.nombres, merged.apellidos].filter(Boolean).join(' '),
    cedula_identidad: merged.rut || '',
    fecha_nacimiento: merged.fecha_nacimiento || '',
    nacionalidad: merged.nacionalidad || '',
    profesion: merged.profesion || '',
    lugar_nacimiento: merged.lugar_nacimiento || '',
    foto_base64: merged.foto_base64 || null,
  }
}
