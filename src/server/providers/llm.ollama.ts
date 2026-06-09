import { LLMConfig, TestResult } from './provider.types'

export async function testConnection(config: LLMConfig): Promise<TestResult> {
  const start = Date.now()
  try {
    const res = await fetch(`${config.base_url}/models`, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return { success: false, message: `HTTP ${res.status}` }
    const data = await res.json()
    const models = data.data || data.models || []
    const modelFound = models.some((m: Record<string, string>) => m.id === config.model || m.name === config.model)
    return {
      success: true,
      message: modelFound
        ? `Connected. Model "${config.model}" available.`
        : `Connected but model "${config.model}" not found. Available: ${models.slice(0, 5).map((m: Record<string, string>) => m.id || m.name).join(', ')}`,
      latency_ms: Date.now() - start,
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, message: `Connection failed: ${message}` }
  }
}

export async function callLLM(
  config: LLMConfig,
  messages: Array<{ role: string; content: string }>,
  options?: { temperature?: number; max_tokens?: number }
): Promise<string> {
  const url = `${config.base_url}/chat/completions`
  const body = {
    model: config.model || 'qwen3:8b',
    messages,
    temperature: options?.temperature ?? config.temperature ?? 0.7,
    max_tokens: options?.max_tokens ?? config.max_tokens ?? 8192,
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300000), // 5 min timeout for large generations
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`LLM request failed (${res.status}): ${errText}`)
  }
  const data = await res.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('No content in LLM response')
  return content
}

function stripThinkTags(text: string): string {
  // Strip /think blocks from qwen3
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
}

export function parseJSONFromLLM(text: string): unknown {
  const cleaned = stripThinkTags(text)
  // Try direct parse
  try {
    return JSON.parse(cleaned)
  } catch {
    // continue to next method
  }
  // Try from code block
  const codeMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (codeMatch) {
    try {
      return JSON.parse(codeMatch[1])
    } catch {
      // continue to next method
    }
  }
  // Try finding JSON in text
  const jsonMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1])
    } catch {
      // continue
    }
  }
  throw new Error('Could not parse JSON from LLM response')
}

export async function generateJSON(
  config: LLMConfig,
  systemPrompt: string,
  userPrompt: string,
  repairAttempts: number = 1
): Promise<unknown> {
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]
  const response = await callLLM(config, messages)

  try {
    return parseJSONFromLLM(response)
  } catch (parseError) {
    if (repairAttempts <= 0) throw parseError

    // Try repair
    const repairMessages = [
      ...messages,
      { role: 'assistant', content: response },
      {
        role: 'user',
        content:
          'Your previous response was not valid JSON. Return ONLY valid JSON without any markdown formatting, comments, or extra text. Fix any trailing commas, missing brackets, or other JSON syntax errors.',
      },
    ]
    const repairResponse = await callLLM(config, repairMessages)
    return parseJSONFromLLM(repairResponse)
  }
}
