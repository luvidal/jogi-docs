type ModelId = 'GPT' | 'ANTHROPIC' | 'GEMINI'

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
const stripFences = (txt: string) => txt.replace(/```json|```/g, '').trim()
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
 * Query Gemini with Google Search grounding enabled.
 * Used for derived fields that need real-world data (e.g., market prices).
 * Returns raw text response — caller is responsible for parsing.
 */
export const queryGrounded = async (
    prompt: string,
    options?: { model?: string }
): Promise<string> => {
    if (!process.env.GEMINI_API_KEY) return ''
    const gemini = await getGemini()
    try {
        const r = await gemini.models.generateContent({
            model: options?.model ?? 'gemini-2.0-flash',
            contents: prompt,
            config: { tools: [{ googleSearch: {} }] }
        })
        return geminiText(r)
    } catch (err: any) {
        // On rate limit, return empty — caller treats as null
        if (isRateLimitError(err)) return ''
        throw err
    }
}

export const model2vision = async (model: ModelId, mimetype: string, base64: string, prompt: string) => {
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
        return stripFences(txt)
    }

    if (model === 'ANTHROPIC' && process.env.ANTHROPIC_API_KEY) {
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
        return stripFences(txt)
    }

    if (model === 'GEMINI' && process.env.GEMINI_API_KEY) {
        const gemini = await getGemini()
        const maxRetries = 2
        let lastError: any = null

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const r = await gemini.models.generateContent({
                    model: 'gemini-2.0-flash',
                    contents: {
                        parts: [
                            { text: content },
                            { inlineData: { mimeType: mimetype, data: base64 } },
                        ],
                    },
                    config: {
                        temperature: 0,
                        maxOutputTokens: 8192,  // Allow longer responses for multi-document PDFs
                        responseMimeType: 'application/json'
                    } as any,
                })
                return stripFences(geminiText(r))
            } catch (err: any) {
                lastError = err
                if (isRateLimitError(err) && attempt < maxRetries) {
                    // Exponential backoff: 1s, 2s
                    await delay(1000 * (attempt + 1))
                    continue
                }
                break
            }
        }

        // Fallback to Anthropic if Gemini rate limited and Anthropic is available
        if (isRateLimitError(lastError) && process.env.ANTHROPIC_API_KEY) {
            console.warn('Gemini rate limited, falling back to Anthropic')
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
            return stripFences(txt)
        }

        // Re-throw the last error if no fallback available
        if (lastError) throw lastError
    }

    return ''
}
