import test from 'node:test'
import assert from 'node:assert/strict'
import { name, inject, apply } from '../lib/index.js'

function makeCtx(extra = {}) {
  const registered = []
  const logs = []
  const effects = []
  let disposed = 0
  return {
    registered,
    logs,
    effects,
    get disposed() { return disposed },
    commands: {
      register: (command) => {
        registered.push(command)
        return () => { disposed++ }
      },
    },
    effect: (body) => { effects.push([...body()]) },
    logger: { info: (m) => logs.push(m) },
    ...extra,
  }
}

const msg = (usage) => ({ type: 'assistant/message', data: { usage } })
const full = () => ({
  inputTokens: 200,
  outputTokens: 100,
  cacheReadTokens: 50,
  cacheWriteTokens: 25,
  reasoningTokens: 25,
  totalTokens: 400,
})

test('entry exports the bundle name and injects only commands', () => {
  assert.equal(name, 'dsh-plugin-token-budget')
  assert.deepEqual(inject, ['commands'])
})

test('apply registers /budget once and ties disposal to the Cordis lifecycle', () => {
  const ctx = makeCtx()
  apply(ctx)
  assert.equal(ctx.registered.length, 1)
  assert.equal(ctx.registered[0].name, 'budget')
  assert.equal(ctx.effects.length, 1)
  assert.equal(ctx.effects[0].length, 1)
  ctx.effects[0][0]()
  assert.equal(ctx.disposed, 1)
  assert.match(ctx.logs[0], /loaded/)
})

test('handler folds session usage with the budget from apply(ctx, config)', () => {
  const ctx = makeCtx()
  apply(ctx, { budget: { maxTokens: 1000 } })
  const command = ctx.registered[0]
  const result = command.handler({
    agent: { session: { events: [msg(full()), msg(full()), { type: 'user/message', data: {} }] } },
    rawInput: '',
  })
  assert.equal(result.kind, 'success')
  assert.match(result.text, /800\/1,000 tokens \(80%\)/)
  assert.match(result.text, /score 80\/100 · WARN/)
  assert.match(result.text, /calls: 2/)
})

test('handler ignores ctx.config and uses only the second apply argument', () => {
  const ctx = makeCtx({ config: { budget: { maxTokens: 1000 } } })
  apply(ctx)
  const result = ctx.registered[0].handler({
    agent: { session: { events: [msg(full()), msg(full())] } },
    rawInput: '--json',
  })
  assert.equal(result.kind, 'success')
  assert.equal(JSON.parse(result.text).maxTokens, 100000)
})

test('handler supports --json and survives missing sessions and invalid config', () => {
  const ctx = makeCtx()
  apply(ctx, { budget: { maxTokens: -1 } })
  const json = ctx.registered[0].handler({ agent: {}, rawInput: '--json' })
  assert.equal(json.kind, 'success')
  assert.equal(JSON.parse(json.text).calls, 0)
  assert.equal(JSON.parse(json.text).verdict, 'ok')
})
