export interface DocProcessorLogger {
  error(error: unknown, context?: Record<string, unknown>): void
  warn(message: string, context?: Record<string, unknown>): void
}

// Use globalThis to share state across multiple entry points (doctypes/, multipart/, index)
// With splitting: false, tsup gives each entry its own module scope — but globalThis is shared.
const GLOBAL_KEY = '__avd_docprocessor__' as const

interface DocProcessorGlobal {
  logger: DocProcessorLogger
  rawDoctypes: Record<string, unknown> | null
}

function getGlobal(): DocProcessorGlobal {
  const g = globalThis as any
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = {
      logger: {
        error: (err: unknown, ctx?: Record<string, unknown>) => console.error('[docprocessor]', err, ctx),
        warn: (msg: string, ctx?: Record<string, unknown>) => console.warn('[docprocessor]', msg, ctx),
      },
      rawDoctypes: null,
    }
  }
  return g[GLOBAL_KEY]
}

export function configure(options: { logger?: DocProcessorLogger; doctypes?: Record<string, unknown> }) {
  const state = getGlobal()
  if (options.logger) state.logger = options.logger
  if (options.doctypes) {
    state.rawDoctypes = options.doctypes
  }
}

export function getLogger(): DocProcessorLogger {
  return getGlobal().logger
}

export function getRawDoctypes(): Record<string, unknown> {
  const raw = getGlobal().rawDoctypes
  if (!raw) {
    throw new Error(
      '@jogi/docprocessor: doctypes not configured. Call configure({ doctypes }) before using doctype functions.'
    )
  }
  return raw
}

