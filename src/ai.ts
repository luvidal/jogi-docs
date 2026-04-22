import type { AIUsage, GroundedResult, ModelArg } from './types'
import { getGeminiCall } from './config'

/**
 * True when *something* can service a Gemini call: either a host-provided
 * gate (e.g. Jogi routing through Vertex AI) or a local API key. Used by the
 * gates below so switching the host to Vertex doesn't require keeping a
 * dead `GEMINI_API_KEY` in the env just to satisfy these checks.
 */
const hasGeminiAuth = (): boolean => !!getGeminiCall() || !!process.env.GEMINI_API_KEY

export interface VisionResult {
    text: string
    usage?: AIUsage
}

export type AiModel = 'GPT' | 'ANTHROPIC' | 'GEMINI'

export const toAiModel = (m: ModelArg): AiModel =>
    m === 'gpt5' ? 'GPT' : m === 'gemini' ? 'GEMINI' : 'ANTHROPIC'

// Lazy-loaded client instances (cached after first use)
let anthropicClient: any = null
let openaiClient: any = null
let geminiClient: any = null

const getAnthropic = async () => {
    if (!anthropicClient) {
        const { default: Anthropic } = await import('@anthropic-ai/sdk')
        anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' })
    }
    return anthropicClient
}

const getOpenAI = async () => {
    if (!openaiClient) {
        const { default: OpenAI } = await import('openai')
        openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' })
    }
    return openaiClient
}

const getGemini = async () => {
    if (!geminiClient) {
        const { GoogleGenAI } = await import('@google/genai')
        geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' })
    }
    return geminiClient
}

const strict = 'Devuelve EXCLUSIVAMENTE JSON válido, sin markdown, sin texto adicional'
export const stripFences = (txt: string) => txt.replace(/```json|```/g, '').trim()
const geminiText = (r: any) => r?.text || r?.candidates?.[0]?.content?.parts?.map?.((p: any) => p?.text || '').join?.('') || ''

// Check if error is transient (rate limit or temporary provider unavailability)
const isRateLimitError = (err: any): boolean => {
    if (!err) return false
    const msg = err.message?.toLowerCase?.() || ''
    const status = err.status || err.statusCode || err.code
    return status === 429 || status === '429' ||
        status === 503 || status === '503' ||
        msg.includes('429') ||
        msg.includes('503') ||
        msg.includes('rate') ||
        msg.includes('resource_exhausted') ||
        msg.includes('quota') ||
        msg.includes('unavailable')
}

// Delay helper
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Resolve the Gemini call path. If the host wired a `geminiCall` hook via
 * `configure({ geminiCall })`, every request flows through it (concurrency
 * gate + typed 429 mapping live on the host side). Otherwise fall back to
 * the SDK directly — useful for CLI / tests / standalone consumers.
 */
const getGeminiCaller = async (): Promise<(params: { model: string; contents: any; config?: any }) => Promise<any>> => {
    const hosted = getGeminiCall()
    if (hosted) return hosted
    const gemini = await getGemini()
    return (params) => gemini.models.generateContent(params)
}

/**
 * Query Gemini with Google Search grounding enabled.
 * Used for derived fields that need real-world data (e.g., market prices).
 * Returns raw text response — caller is responsible for parsing.
 */
export const queryGrounded = async (
    prompt: string,
    options?: { model?: string }
): Promise<GroundedResult> => {
    if (!hasGeminiAuth()) return { text: '' }
    const callGemini = await getGeminiCaller()
    try {
        const r = await callGemini({
            model: options?.model ?? 'gemini-2.0-flash',
            contents: prompt,
            config: { tools: [{ googleSearch: {} }] }
        })
        const um = r?.usageMetadata
        return {
            text: geminiText(r),
            usage: um ? { promptTokenCount: um.promptTokenCount, candidatesTokenCount: um.candidatesTokenCount } : undefined
        }
    } catch (err: any) {
        // On rate limit, return empty — caller treats as null
        if (isRateLimitError(err)) return { text: '' }
        throw err
    }
}

/** Call Anthropic Claude with vision content */
const callAnthropic = async (mimetype: string, base64: string, content: string): Promise<VisionResult> => {
    const anthropic = await getAnthropic()
    const visionContent = [
        { type: 'text', text: content },
        mimetype === 'application/pdf'
            ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
            : { type: 'image', source: { type: 'base64', media_type: mimetype as any, data: base64 } },
    ] as any
    const r = await anthropic.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 2048, temperature: 0, messages: [{ role: 'user', content: visionContent }] })
    const block = r.content?.find((b: any) => b.type === 'text') as any
    const txt = block?.text?.trim() || ''
    const u = r.usage
    return {
        text: stripFences(txt),
        usage: u ? { promptTokenCount: u.input_tokens, candidatesTokenCount: u.output_tokens } : undefined
    }
}

export const model2vision = async (model: AiModel, mimetype: string, base64: string, prompt: string): Promise<VisionResult> => {
    const content = `${strict}\n${prompt}`

    if (model === 'GPT' && process.env.OPENAI_API_KEY) {
        if (mimetype === 'application/pdf') throw new Error('GPT no soporta PDF')
        const openai = await getOpenAI()
        const r = await openai.chat.completions.create({
            model: 'gpt-4o',
            temperature: 0,
            messages: [
                {
                    role: 'user',
                    content: [{ type: 'text', text: content }, { type: 'image_url', image_url: { url: `data:${mimetype};base64,${base64}` } }],
                },
            ],
        })
        const txt = r.choices?.[0]?.message?.content?.trim() || ''
        const u = r.usage
        return {
            text: stripFences(txt),
            usage: u ? { promptTokenCount: u.prompt_tokens, candidatesTokenCount: u.completion_tokens } : undefined
        }
    }

    if (model === 'ANTHROPIC' && process.env.ANTHROPIC_API_KEY) {
        return callAnthropic(mimetype, base64, content)
    }

    if (model === 'GEMINI' && hasGeminiAuth()) {
        const callGemini = await getGeminiCaller()
        // Rate-limit retries are the host gate's job (it knows the real quota
        // state). Here we just do a light retry for transient SDK hiccups.
        const maxRetries = 2
        let lastError: any = null

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const r = await callGemini({
                    model: 'gemini-2.0-flash',
                    contents: {
                        parts: [
                            { text: content },
                            { inlineData: { mimeType: mimetype, data: base64 } },
                        ],
                    },
                    config: {
                        temperature: 0,
                        maxOutputTokens: 8192,
                        responseMimeType: 'application/json'
                    } as any,
                })
                const um = r?.usageMetadata
                return {
                    text: stripFences(geminiText(r)),
                    usage: um ? { promptTokenCount: um.promptTokenCount, candidatesTokenCount: um.candidatesTokenCount } : undefined
                }
            } catch (err: any) {
                lastError = err
                // Never retry rate-limit errors — the host surfaces them as
                // typed 429s and the UI shows a dedicated toast. Retrying
                // here would silently compound the collision.
                if (isRateLimitError(err)) throw err
                if (attempt < maxRetries) {
                    await delay(1000 * (attempt + 1))
                    continue
                }
                break
            }
        }

        if (lastError) throw lastError
    }

    return { text: '' }
}
