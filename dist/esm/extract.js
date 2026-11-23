/**
 * Extracts normalized UsageInput from a raw LLM provider response.
 *
 * Supported shapes:
 *   Anthropic: response.usage.input_tokens / output_tokens / cache_read_input_tokens / cache_creation_input_tokens
 *   OpenAI:    response.usage.prompt_tokens / completion_tokens (Chat Completions)
 *              response.usage.input_tokens / output_tokens / input_tokens_details (Responses API)
 *   Gemini:    response.usageMetadata.promptTokenCount / candidatesTokenCount (or usage_metadata.*_token_count)
 *   Normalized: already a UsageInput ({ inputTokens, outputTokens })
 *
 * Throws a descriptive error if the shape is unrecognized.
 */
export function extractUsage(response) {
    if (response === null || typeof response !== 'object') {
        throw new TypeError('[agent-budget] Cannot extract usage: response is not an object. Pass usage manually via .track().');
    }
    const r = response;
    // ── OpenAI Responses API ──────────────────────────────────────────────────
    // Same field names as Anthropic's, but input_tokens INCLUDES the cached tokens, which are
    // reported under input_tokens_details.cached_tokens. Read as Anthropic's, every cached
    // token would be billed at the full input rate; split them out as for Chat Completions.
    if (typeof r.usage?.input_tokens === 'number' && r.usage.input_tokens_details != null) {
        const cached = Math.min(r.usage.input_tokens_details.cached_tokens ?? 0, r.usage.input_tokens);
        return {
            inputTokens: r.usage.input_tokens - cached,
            outputTokens: r.usage.output_tokens ?? 0,
            cacheReadTokens: cached,
        };
    }
    // ── Anthropic ──────────────────────────────────────────────────────────────
    if (typeof r.usage?.input_tokens === 'number') {
        return {
            inputTokens: r.usage.input_tokens,
            outputTokens: r.usage.output_tokens ?? 0,
            cacheReadTokens: r.usage.cache_read_input_tokens ?? 0,
            cacheWriteTokens: r.usage.cache_creation_input_tokens ?? 0,
        };
    }
    // ── OpenAI ────────────────────────────────────────────────────────────────
    if (typeof r.usage?.prompt_tokens === 'number') {
        // OpenAI cached input tokens live under usage.prompt_tokens_details.cached_tokens,
        // and are already counted in prompt_tokens. Split them out so they're billed once,
        // at the cache rate, not again at the full input rate.
        const cached = Math.min(r.usage.prompt_tokens_details?.cached_tokens ?? 0, r.usage.prompt_tokens);
        return {
            inputTokens: r.usage.prompt_tokens - cached,
            outputTokens: r.usage.completion_tokens ?? 0,
            cacheReadTokens: cached,
        };
    }
    // ── Gemini ────────────────────────────────────────────────────────────────
    // promptTokenCount includes cachedContentTokenCount, so the cached part is split out to be
    // billed once at the cache rate; thinking (thoughtsTokenCount) is billed as output.
    const g = r.usageMetadata ?? r.usage_metadata;
    if (g && typeof (g.promptTokenCount ?? g.prompt_token_count) === 'number') {
        const prompt = g.promptTokenCount ?? g.prompt_token_count;
        const cached = Math.min(g.cachedContentTokenCount ?? g.cached_content_token_count ?? 0, prompt);
        return {
            inputTokens: prompt - cached,
            outputTokens: (g.candidatesTokenCount ?? g.candidates_token_count ?? 0) +
                (g.thoughtsTokenCount ?? g.thoughts_token_count ?? 0),
            cacheReadTokens: cached,
        };
    }
    // ── Already normalized ────────────────────────────────────────────────────
    // Only accept this if it has EXACTLY the required shape — never trust partial matches.
    if (typeof r.inputTokens === 'number' && typeof r.outputTokens === 'number') {
        return {
            inputTokens: r.inputTokens,
            outputTokens: r.outputTokens,
            cacheReadTokens: typeof r.cacheReadTokens === 'number' ? r.cacheReadTokens : 0,
            cacheWriteTokens: typeof r.cacheWriteTokens === 'number' ? r.cacheWriteTokens : 0,
        };
    }
    throw new TypeError('[agent-budget] Unrecognized response shape. Expected Anthropic, OpenAI or Gemini usage format. ' +
        'Pass usage manually: budget.track({ inputTokens, outputTokens }, model)');
}
/**
 * Validates a UsageInput object. Throws on negative or non-finite values.
 */
export function validateUsage(usage) {
    const fields = [
        'inputTokens',
        'outputTokens',
        'cacheReadTokens',
        'cacheWriteTokens',
    ];
    for (const field of fields) {
        const val = usage[field];
        if (val === undefined)
            continue;
        if (typeof val !== 'number' || !Number.isFinite(val) || val < 0 || !Number.isInteger(val)) {
            throw new TypeError(`[agent-budget] usage.${field} must be a non-negative integer, got: ${val}`);
        }
    }
}
//# sourceMappingURL=extract.js.map