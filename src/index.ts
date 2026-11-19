import {
  DEFAULT_BUDGET,
  fold,
  formatReport,
  normalizeBudget,
  redact,
  type Budget,
} from './core.js'

export const name = 'dsh-plugin-token-budget'

/** The command registry is the only host service we activate. */
export const inject = ['commands']

interface CommandContext {
  commands: {
    register(command: {
      name: string
      description: string
      input?: { hint?: string }
      handler: (args: { agent?: { session?: { events?: readonly unknown[] } }; rawInput?: string }) =>
        | { kind: 'success'; text: string }
        | { kind: 'error'; text: string }
    }): () => void
  }
  /** Cordis lifecycle scope; registers disposables so disable/reload leaves no duplicate command. */
  effect?: (body: () => Generator, label?: string) => void
  logger?: { info?: (message: string) => void; warn?: (message: string) => void }
}

/** DSH passes the bundle row's `config` as the second argument to apply(). */
function readBudget(config: unknown): Budget {
  if (config && typeof config === 'object' && 'budget' in config) {
    return normalizeBudget((config as Record<string, unknown>).budget)
  }
  return DEFAULT_BUDGET
}

/**
 * Cordis bundle entry. Registers `/budget`, a read-only report that folds token
 * usage from the current session against a configurable budget.
 */
export function apply(ctx: CommandContext, config?: unknown): void {
  const budget = readBudget(config)

  const dispose = ctx.commands.register({
    name: 'budget',
    description: 'Report this session\'s token usage against your budget',
    input: { hint: '[--json]' },
    handler: ({ agent, rawInput }) => {
      try {
        const events = Array.isArray(agent?.session?.events) ? agent.session.events : []
        const summary = fold(events, budget)
        const json = (rawInput ?? '').trim() === '--json'
        return { kind: 'success', text: formatReport(summary, { json }) }
      } catch (error) {
        const reason = redact(error instanceof Error ? error.message : String(error))
        return { kind: 'error', text: `[budget] failed: ${reason}` }
      }
    },
  })

  if (typeof ctx.effect === 'function') {
    ctx.effect(function* () { yield dispose }, `${name} lifecycle`)
  }

  ctx.logger?.info?.('[dsh-plugin-token-budget] loaded (read-only; /budget available)')
}
