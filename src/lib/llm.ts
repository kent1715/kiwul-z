import { db } from '@/lib/db'
import { openAIEndpoint } from '@/server/url'

export interface LLMProvider {
  id: string
  name: string
  base_url: string
  model: string | null
  config_json: string
}

export async function getLLMProvider(): Promise<LLMProvider | null> {
  const provider = await db.provider.findFirst({
    where: { type: 'llm', is_active: true },
    orderBy: { is_default: 'desc' },
  })
  return provider
}

export async function callLLM(
  provider: LLMProvider,
  messages: Array<{ role: string; content: string }>,
  options?: { temperature?: number; max_tokens?: number; response_format?: Record<string, unknown> }
): Promise<string> {
  const url = openAIEndpoint(provider.base_url, '/chat/completions')

  const body: Record<string, unknown> = {
    model: provider.model || 'gpt-3.5-turbo',
    messages,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.max_tokens ?? 4096,
  }

  if (options?.response_format) {
    body.response_format = options.response_format
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`LLM request failed (${response.status}): ${errorText}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content

  if (!content) {
    throw new Error('No content in LLM response')
  }

  return content
}

export function parseJSONFromLLM(text: string): unknown {
  // Try direct parse first
  try {
    return JSON.parse(text)
  } catch {
    // Continue to other methods
  }

  // Try to extract from markdown code blocks
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1])
    } catch {
      // Continue
    }
  }

  // Try to find JSON object or array in the text
  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1])
    } catch {
      // Continue
    }
  }

  throw new Error('Could not parse JSON from LLM response')
}

export async function getPromptTemplate(type: string): Promise<string | null> {
  const template = await db.promptTemplate.findFirst({
    where: { type, is_default: true },
  })
  return template?.template ?? null
}
