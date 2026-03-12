interface DocProcessorLogger {
    error(error: unknown, context?: Record<string, unknown>): void;
    warn(message: string, context?: Record<string, unknown>): void;
}
declare function configure(options: {
    logger?: DocProcessorLogger;
    doctypes?: Record<string, unknown>;
}): void;

export { type DocProcessorLogger as D, configure as c };
