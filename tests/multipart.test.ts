import { describe, it, expect, beforeAll } from 'vitest'
import { configure } from '../src/config'
import {
  getMultiPartConfig,
  isMultiPartDocType,
  getMultiPartDocTypeIds,
  getPartIdFromFilename,
  getDocTypeFromFilename,
  isMultiPartFile,
  getPartLabel,
  partFilenameConditions,
} from '../src/multipart'

const fixtureDoctypes = {
  'cedula-identidad': {
    label: 'Cédula',
    category: 'identidad',
    definition: 'Cédula',
    fields: [],
    parts: ['Frente', 'Revés'],
  },
  'liquidacion-sueldo': {
    label: 'Liquidación',
    category: 'ingresos',
    definition: 'Liquidación',
    fields: [],
  },
}

beforeAll(() => {
  configure({ doctypes: fixtureDoctypes })
})

describe('multipart', () => {
  describe('getPartIdFromFilename', () => {
    it('extracts front part ID', () => {
      expect(getPartIdFromFilename('2024-01-15_cedula-identidad_front.pdf')).toBe('front')
    })

    it('extracts back part ID', () => {
      expect(getPartIdFromFilename('2024-01-15_cedula-identidad_back.pdf')).toBe('back')
    })

    it('returns null for filename without part ID', () => {
      expect(getPartIdFromFilename('2024-01-15_some-document.pdf')).toBeNull()
    })

    it('returns null for empty string', () => {
      expect(getPartIdFromFilename('')).toBeNull()
    })

    it('handles different file extensions', () => {
      expect(getPartIdFromFilename('2024-01-15_doc_front.jpg')).toBe('front')
      expect(getPartIdFromFilename('2024-01-15_doc_back.png')).toBe('back')
    })

    it('extracts from space-delimited filenames', () => {
      expect(getPartIdFromFilename('Cédula de Identidad front.jpg')).toBe('front')
      expect(getPartIdFromFilename('Cédula de Identidad back.png')).toBe('back')
    })

    it('extracts from Spanish labels (Frente/Revés)', () => {
      expect(getPartIdFromFilename('Cédula de Identidad Frente.jpg')).toBe('front')
      expect(getPartIdFromFilename('Cédula de Identidad Revés.png')).toBe('back')
    })

    it('handles case-insensitive Spanish labels', () => {
      expect(getPartIdFromFilename('Cédula de Identidad frente.jpg')).toBe('front')
      expect(getPartIdFromFilename('Cédula de Identidad revés.png')).toBe('back')
      expect(getPartIdFromFilename('Cédula de Identidad FRENTE.jpg')).toBe('front')
    })

    it('handles Revés without accent (Reves)', () => {
      expect(getPartIdFromFilename('Cédula de Identidad Reves.jpg')).toBe('back')
    })
  })

  describe('getDocTypeFromFilename', () => {
    it('extracts doctype ID from filename with part', () => {
      expect(getDocTypeFromFilename('2024-01-15_cedula-identidad_front.pdf')).toBe('cedula-identidad')
    })

    it('returns null for filename without proper structure', () => {
      expect(getDocTypeFromFilename('document.pdf')).toBeNull()
    })

    it('returns null for empty string', () => {
      expect(getDocTypeFromFilename('')).toBeNull()
    })
  })

  describe('getMultiPartConfig', () => {
    it('returns null for non-multipart doctypes', () => {
      expect(getMultiPartConfig('non-existent-doctype')).toBeNull()
    })

    it('returns null for doctypes without parts', () => {
      expect(getMultiPartConfig('liquidacion-sueldo')).toBeNull()
    })

    it('returns config for cedula-identidad', () => {
      const config = getMultiPartConfig('cedula-identidad')
      expect(config).not.toBeNull()
      expect(config?.enabled).toBe(true)
      expect(config?.parts).toHaveLength(2)
      expect(config?.parts[0].id).toBe('front')
      expect(config?.parts[1].id).toBe('back')
    })
  })

  describe('isMultiPartDocType', () => {
    it('returns true for cedula-identidad', () => {
      expect(isMultiPartDocType('cedula-identidad')).toBe(true)
    })

    it('returns false for non-multipart doctypes', () => {
      expect(isMultiPartDocType('liquidacion-sueldo')).toBe(false)
    })

    it('returns false for non-existent doctype', () => {
      expect(isMultiPartDocType('non-existent')).toBe(false)
    })
  })

  describe('getMultiPartDocTypeIds', () => {
    it('returns array containing cedula-identidad', () => {
      const ids = getMultiPartDocTypeIds()
      expect(Array.isArray(ids)).toBe(true)
      expect(ids).toContain('cedula-identidad')
    })
  })

  describe('isMultiPartFile', () => {
    it('returns false for non-multipart doctypes', () => {
      expect(isMultiPartFile('doc_front.pdf', 'non-existent')).toBe(false)
    })

    it('returns false when filename has no part ID', () => {
      expect(isMultiPartFile('2024-01-15_doc.pdf', 'cedula-identidad')).toBe(false)
    })

    it('returns true for valid multipart file', () => {
      expect(isMultiPartFile('2024-01-15_cedula_front.pdf', 'cedula-identidad')).toBe(true)
    })
  })

  describe('partFilenameConditions', () => {
    it('generates conditions for English partId only when no doctypeid', () => {
      const conditions = partFilenameConditions('front')
      expect(conditions).toHaveLength(8)
      expect(conditions).toContainEqual({ filename: { endsWith: '_front.pdf' } })
      expect(conditions).toContainEqual({ filename: { endsWith: ' front.pdf' } })
    })

    it('generates conditions for both English and Spanish when doctypeid provided', () => {
      const conditions = partFilenameConditions('front', 'cedula-identidad')
      expect(conditions).toHaveLength(16)
      expect(conditions).toContainEqual({ filename: { endsWith: '_front.pdf' } })
      expect(conditions).toContainEqual({ filename: { endsWith: '_Frente.pdf' } })
    })

    it('generates conditions for back/Revés', () => {
      const conditions = partFilenameConditions('back', 'cedula-identidad')
      expect(conditions).toHaveLength(16)
      expect(conditions).toContainEqual({ filename: { endsWith: '_back.pdf' } })
      expect(conditions).toContainEqual({ filename: { endsWith: ' Revés.pdf' } })
    })
  })

  describe('getPartLabel', () => {
    it('returns label for valid part', () => {
      expect(getPartLabel('cedula-identidad', 'front')).toBe('Frente')
      expect(getPartLabel('cedula-identidad', 'back')).toBe('Revés')
    })

    it('returns null for non-multipart doctypes', () => {
      expect(getPartLabel('non-existent', 'front')).toBeNull()
    })

    it('returns null for non-existent part ID', () => {
      expect(getPartLabel('cedula-identidad', 'middle')).toBeNull()
    })
  })
})
