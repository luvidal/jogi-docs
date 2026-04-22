interface DocProcessorLogger {
    error(error: unknown, context?: Record<string, unknown>): void;
    warn(message: string, context?: Record<string, unknown>): void;
}
/**
 * Optional Gemini call hook. When provided via `configure({ geminiCall })`,
 * every `gemini.models.generateContent` invocation inside this module is
 * routed through it instead of calling the SDK directly. Hosts use this to
 * enforce a process-wide concurrency gate and a typed 429 mapping.
 */
type GeminiCall = (params: {
    model: string;
    contents: any;
    config?: any;
}) => Promise<any>;
declare function configure(options: {
    logger?: DocProcessorLogger;
    doctypes?: Record<string, unknown>;
    geminiCall?: GeminiCall;
}): void;

export { type DocProcessorLogger as D, configure as c };
