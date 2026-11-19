/**
 * Pure, dependency-free core for dsh-plugin-token-budget.
 *
 * Reads only token counters from `assistant/message` events. It never reads,
 * stores, or transmits prompts, reasoning text, tool bodies, or file contents.
 */

/** Token counters observed on a single `assistant/message` event. */
export interface Usage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  reasoningTokens: number
  totalTokens: number
}

/** A validated spending budget. */
export interface Budget {
  maxTokens: number
}

/** Per-session totals folded from every observed usage record. */
export interface Totals extends Usage {
  /** Number of `assistant/message` events that carried a usage record. */
  calls: number
}

export type Verdict = 'ok' | 'warn' | 'over'

export interface Summary extends Totals {
  /** The budget this summary was folded against. */
  maxTokens: number
  /** Raw percentage of the budget consumed (may exceed 100). */
  percent: number
  /** Budget utilisation mapped onto 0–100: `clamp(round(percent), 0, 100)`. */
  score: number
  verdict: Verdict
}

export const DEFAULT_BUDGET: Budget = { maxTokens: 100_000 }

/** Warn once this share of the budget has been consumed. */
export const WARN_AT = 80
/** Report `over` once consumption strictly exceeds this share. */
export const OVER_AT = 100

const SECRET =
  /((?:token|key|secret|password|authorization|bearer)[^\s:=]{0,24}[:=]\s*)[^\s&]+/gi
const QUERY_SECRET = /([?&](?:token|key|secret|password|auth)=)[^&#\s]+/gi

/** Strip credential-looking substrings before anything is printed. */
export function redact(value: unknown): string {
  const text = value instanceof Error ? value.stack || value.message : String(value)
  return text.replace(SECRET, '$1[redacted]').replace(QUERY_SECRET, '$1[redacted]')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Accept only finite, non-negative numeric counters. */
function toCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

/**
 * Extract token counters from one session event.
 * Only `assistant/message` events with a `data.usage` object are considered.
 * When `totalTokens` is absent it is derived from the component counters.
 */
export function readUsage(event: unknown): Usage | null {
  if (!isRecord(event) || event.type !== 'assistant/message') return null
  if (!isRecord(event.data) || !isRecord(event.data.usage)) return null

  const usage = event.data.usage
  const inputTokens = toCount(usage.inputTokens) ?? 0
  const outputTokens = toCount(usage.outputTokens) ?? 0
  const cacheReadTokens = toCount(usage.cacheReadTokens) ?? 0
  const cacheWriteTokens = toCount(usage.cacheWriteTokens) ?? 0
  const reasoningTokens = toCount(usage.reasoningTokens) ?? 0
  const reported = toCount(usage.totalTokens)
  const totalTokens = reported ?? (
    inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens + reasoningTokens
  )

  return { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, reasoningTokens, totalTokens }
}

/** Normalize untrusted config into a Budget; invalid shapes fall back to the default. */
export function normalizeBudget(value: unknown): Budget {
  if (!isRecord(value)) return DEFAULT_BUDGET
  const raw = toCount(value.maxTokens)
  if (raw === null || raw < 1) return DEFAULT_BUDGET
  const maxTokens = Math.floor(raw)
  return maxTokens >= 1 ? { maxTokens } : DEFAULT_BUDGET
}

function clampScore(percent: number): number {
  if (!Number.isFinite(percent) || percent <= 0) return 0
  return Math.min(100, Math.round(percent))
}

function verdictFor(percent: number): Verdict {
  if (!Number.isFinite(percent)) return 'ok'
  if (percent > OVER_AT) return 'over'
  if (percent >= WARN_AT) return 'warn'
  return 'ok'
}

/** Fold a session event log into a token-budget summary. */
export function fold(events: readonly unknown[], budget: Budget = DEFAULT_BUDGET): Summary {
  const totals: Totals = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    calls: 0,
  }

  for (const event of events) {
    const usage = readUsage(event)
    if (!usage) continue
    totals.inputTokens += usage.inputTokens
    totals.outputTokens += usage.outputTokens
    totals.cacheReadTokens += usage.cacheReadTokens
    totals.cacheWriteTokens += usage.cacheWriteTokens
    totals.reasoningTokens += usage.reasoningTokens
    totals.totalTokens += usage.totalTokens
    totals.calls++
  }

  const maxTokens = normalizeBudget(budget).maxTokens
  const percent = maxTokens > 0 ? Math.round((totals.totalTokens / maxTokens) * 1000) / 10 : 0

  return {
    ...totals,
    maxTokens,
    percent: Number.isFinite(percent) ? percent : 0,
    score: clampScore(percent),
    verdict: verdictFor(percent),
  }
}

function group(value: number): string {
  return Math.round(value).toLocaleString('en-US')
}

/** Compact, shareable text report. Only token numbers are printed. */
export function formatReport(summary: Summary, options: { json?: boolean } = {}): string {
  if (options.json) return JSON.stringify(summary, null, 2)

  const label = summary.verdict.toUpperCase()
  const head = `[budget] ${redact(group(summary.totalTokens))}/${redact(group(summary.maxTokens))} tokens ` +
    `(${redact(String(summary.percent))}%) · score ${summary.score}/100 · ${label}`
  const detail = `  calls: ${summary.calls}  input: ${redact(group(summary.inputTokens))}  ` +
    `output: ${redact(group(summary.outputTokens))}  cache-read: ${redact(group(summary.cacheReadTokens))}  ` +
    `cache-write: ${redact(group(summary.cacheWriteTokens))}  reasoning: ${redact(group(summary.reasoningTokens))}`

  if (summary.calls === 0) {
    return `${head}\n  no model calls observed in this session yet`
  }

  const tip = summary.verdict === 'ok'
    ? ''
    : summary.verdict === 'warn'
      ? '\nHeads-up: budget is at least 80% used. Consider shorter turns or a higher maxTokens.'
      : '\nOver budget: this session has exceeded maxTokens. Review usage or raise the budget in cordis.patch.yml.'
  return [head, detail].join('\n') + tip
}
