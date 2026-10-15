/**
 * Utility to scrub and redact sensitive credentials, tokens, and secrets
 * before writing handoff documents.
 */

const SECRET_PATTERNS = [
  // OpenAI & Anthropic API keys
  /sk-(?:proj-|ant-)?[a-zA-Z0-9_\-]{20,}/g,
  // GitHub tokens (Personal access token, OAuth token, etc.)
  /(?:ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9_]{20,}/g,
  // Generic Bearer tokens
  /Bearer\s+[a-zA-Z0-9_\-\.]{20,}/gi,
  // AWS Access Key ID
  /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g,
  // Slack tokens / webhooks
  /xox[baprs]-[0-9]{10,}-[a-zA-Z0-9_\-]+/g,
  /https:\/\/hooks\.slack\.com\/services\/T[a-zA-Z0-9_]+\/B[a-zA-Z0-9_]+\/[a-zA-Z0-9_]+/g,
  // Generic key/secret assignments (e.g. api_key="...", password="...")
  /(?:api[_-]?key|apikey|secret|password|passwd|auth[_-]?token)\s*[:=]\s*["']?([a-zA-Z0-9_\-\.]{8,})["']?/gi,
]

export function redactSecrets(text: string): string {
  if (!text) return ""
  let result = text

  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, (match, p1) => {
      if (p1 && match.includes(p1)) {
        return match.replace(p1, "[REDACTED_SECRET]")
      }
      if (match.startsWith("Bearer ")) {
        return "Bearer [REDACTED_TOKEN]"
      }
      return "[REDACTED_SECRET]"
    })
  }

  return result
}
