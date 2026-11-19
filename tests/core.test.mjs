import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_BUDGET,
  fold,
  formatReport,
  normalizeBudget,
  readUsage,
  redact,
} from '../lib/core.js'

const msg = (usage) => ({ type: 'assistant/message', data: { usage } })
const full = () => ({
  inputTokens: 200,
  outputTokens: 100,
  cacheReadTokens: 50,
  cacheWriteTokens: 25,
  reasoningTokens: 25,
  totalTokens: 400,
})

test('redact strips common credential shapes', () => {
  assert.equal(redact('api_key=secret123'), 'api_key=[redacted]')
  assert.equal(redact('https://x.dev/?token=abc&y=1'), 'https://x.dev/?token=[redacted]&y=1')
  assert.equal(redact('bearer=abc123'), 'bearer=[redacted]')
})

test('readUsage reads all counters from an assistant/message event', () => {
  assert.deepEqual(readUsage(msg(full())), {
    inputTokens: 200,
    outputTokens: 100,
    cacheReadTokens: 50,
    cacheWriteTokens: 25,
    reasoningTokens: 25,
    totalTokens: 400,
  })
})

test('readUsage derives totalTokens from components when missing', () => {
  const usage = readUsage(msg({ inputTokens: 10, outputTokens: 20, cacheReadTokens: 5 }))
  assert.equal(usage.totalTokens, 35)
  assert.equal(usage.cacheWriteTokens, 0)
  assert.equal(usage.reasoningTokens, 0)
})

test('readUsage ignores unrelated, malformed, and non-numeric usage', () => {
  assert.equal(readUsage({ type: 'user/message', data: { usage: full() } }), null)
  assert.equal(readUsage({ type: 'assistant/message', data: {} }), null)
  assert.equal(readUsage({ type: 'assistant/message', data: { usage: 'nope' } }), null)
  assert.equal(readUsage(null), null)
  assert.deepEqual(
    readUsage(msg({ inputTokens: '100', outputTokens: -5, totalTokens: NaN })),
    { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, totalTokens: 0 },
  )
})

test('normalizeBudget falls back to default on invalid shapes', () => {
  assert.deepEqual(normalizeBudget(null), DEFAULT_BUDGET)
  assert.deepEqual(normalizeBudget({}), DEFAULT_BUDGET)
  assert.deepEqual(normalizeBudget({ maxTokens: 0 }), DEFAULT_BUDGET)
  assert.deepEqual(normalizeBudget({ maxTokens: -5 }), DEFAULT_BUDGET)
  assert.deepEqual(normalizeBudget({ maxTokens: '1000' }), DEFAULT_BUDGET)
  assert.deepEqual(normalizeBudget({ maxTokens: Infinity }), DEFAULT_BUDGET)
})

test('normalizeBudget accepts positive finite numbers and floors them', () => {
  assert.deepEqual(normalizeBudget({ maxTokens: 5000 }), { maxTokens: 5000 })
  assert.deepEqual(normalizeBudget({ maxTokens: 1234.9 }), { maxTokens: 1234 })
})

test('fold reports an empty session with zero usage', () => {
  const s = fold([])
  assert.equal(s.calls, 0)
  assert.equal(s.totalTokens, 0)
  assert.equal(s.percent, 0)
  assert.equal(s.score, 0)
  assert.equal(s.verdict, 'ok')
  assert.equal(s.maxTokens, 100000)
})

test('fold sums totals across calls and counts model calls', () => {
  const s = fold([msg(full()), msg(full()), { type: 'turn/start', data: {} }], { maxTokens: 100000 })
  assert.equal(s.calls, 2)
  assert.deepEqual(
    [s.inputTokens, s.outputTokens, s.cacheReadTokens, s.cacheWriteTokens, s.reasoningTokens, s.totalTokens],
    [400, 200, 100, 50, 50, 800],
  )
  assert.equal(s.percent, 0.8)
  assert.equal(s.score, 1)
  assert.equal(s.verdict, 'ok')
})

test('fold warns at 80% and over at more than 100%', () => {
  const warn = fold([msg(full()), msg(full())], { maxTokens: 1000 })
  assert.equal(warn.percent, 80)
  assert.equal(warn.score, 80)
  assert.equal(warn.verdict, 'warn')

  const exact = fold([msg(full()), msg({ totalTokens: 600 })], { maxTokens: 1000 })
  assert.equal(exact.percent, 100)
  assert.equal(exact.verdict, 'warn')

  const over = fold([msg({ totalTokens: 1200 })], { maxTokens: 1000 })
  assert.equal(over.percent, 120)
  assert.equal(over.score, 100)
  assert.equal(over.verdict, 'over')
})

test('fold defensively falls back when the budget is invalid', () => {
  const s = fold([msg(full())], { maxTokens: -1 })
  assert.equal(s.maxTokens, DEFAULT_BUDGET.maxTokens)
})

test('formatReport prints a compact text report and clean --json', () => {
  const summary = fold([msg(full()), msg(full())], { maxTokens: 1000 })
  const text = formatReport(summary)
  assert.match(text, /800\/1,000 tokens \(80%\)/)
  assert.match(text, /score 80\/100 · WARN/)
  assert.match(text, /calls: 2/)
  assert.match(text, /Heads-up/)

  const json = formatReport(summary, { json: true })
  const parsed = JSON.parse(json)
  assert.equal(parsed.calls, 2)
  assert.equal(parsed.verdict, 'warn')
  assert.equal(parsed.maxTokens, 1000)
})

test('formatReport handles an empty session without a detail line', () => {
  const text = formatReport(fold([]))
  assert.match(text, /no model calls observed/)
  assert.doesNotMatch(text, /calls: 0/)
})
