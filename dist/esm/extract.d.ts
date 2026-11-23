import type { UsageInput } from './types.js';
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
export declare function extractUsage(response: unknown): UsageInput;
/**
 * Validates a UsageInput object. Throws on negative or non-finite values.
 */
export declare function validateUsage(usage: UsageInput): void;
//# sourceMappingURL=extract.d.ts.map