/**
 * Build an OpenAI-compatible endpoint URL from a base URL and endpoint path.
 *
 * Handles base URLs that already end with /v1 and those that don't.
 * Ensures no double-slash or duplicate /v1 segment.
 *
 * @example
 * openAIEndpoint("http://localhost:11434/v1", "/chat/completions")
 * // => "http://localhost:11434/v1/chat/completions"
 *
 * openAIEndpoint("http://localhost:11434", "/chat/completions")
 * // => "http://localhost:11434/v1/chat/completions"
 *
 * openAIEndpoint("http://localhost:9100/v1/", "/images/generations")
 * // => "http://localhost:9100/v1/images/generations"
 */
export function openAIEndpoint(baseUrl: string, endpointPath: string): string {
  const clean = baseUrl.replace(/\/+$/, "")
  if (clean.endsWith("/v1")) return `${clean}${endpointPath}`
  return `${clean}/v1${endpointPath}`
}
