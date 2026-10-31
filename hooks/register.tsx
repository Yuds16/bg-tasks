import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

const PANE = 'bg-tasks'
const tick = atom({ plugin: 'bg-tasks', key: 'tick' } as const, 0)

type Task = { id: string; type: string; status: string; description: string }
type Snapshot = {
  sessionId: string
  cwd: string
  updatedAt: number
  tasks: Task[]
}

// Every session writes its own file here; the pane reads them all.
const STALE_MS = 6 * 60 * 60 * 1000

async function dirOf($: any): Promise<string> {
  const home =
    (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? '.'
  return `${home}/.claude/background-tasks`
}

async function save($: any, sessionId: string, cwd: string, tasks: Task[]) {
  const snap: Snapshot = {
    sessionId,
    cwd,
    updatedAt: await $.clock.now(),
    tasks,
  }
  await $.fs.write(`${await dirOf($)}/${sessionId}.json`, JSON.stringify(snap))
}

async function load($: any, sessionId: string): Promise<Snapshot | null> {
  try {
    return JSON.parse(await $.fs.read(`${await dirOf($)}/${sessionId}.json`))
  } catch {
    return null
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'bg-tasks',
      description: 'Show background tasks running in all sessions',
    })
    void $.ui.open({ id: PANE, title: 'Background tasks' })
    $.clock.every(3000, () => void update($, tick, n => n + 1))

    return next(e)
  })

  on('command.run', { command: 'bg-tasks' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Background tasks' })

    return { text: 'Background tasks pane opened.' }
  })

  // Authoritative snapshot of this session's in-flight work.
  on('classic.Stop', async ($, e, next) => {
    const tasks = (e.background_tasks ?? []).map(t => ({
      id: t.id,
      type: t.type,
      status: t.status,
      description: t.command ?? t.description,
    }))
    await save($, e.session_id, e.cwd, tasks)
    await update($, tick, n => n + 1)

    return next(e)
  })

  // Show a task the moment it starts, before the turn's Stop snapshot.
  on('tool.call', async ($, e, next) => {
    const input = e as unknown as {
      run_in_background?: boolean
      command?: string
      description?: string
      tool_use_id?: string
    }
    if (input.run_in_background) {
      const sessionId = await $.session.id()
      const snap = await load($, sessionId)
      const task: Task = {
        id: input.tool_use_id ?? `pending-${await $.clock.now()}`,
        type: e.tool,
        status: 'running',
        description: input.command ?? input.description ?? e.tool,
      }
      await save($, sessionId, await $.session.cwd(), [
        ...(snap?.tasks ?? []),
        task,
      ])
      await update($, tick, n => n + 1)
    }

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    await save($, await $.session.id(), '', [])

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    await read($, tick)
    const now = await $.clock.now()
    const dir = await dirOf($)
    const snaps: Snapshot[] = []
    try {
      for (const f of await $.fs.list(dir)) {
        if (!f.name.endsWith('.json')) continue
        try {
          const s: Snapshot = JSON.parse(await $.fs.read(`${dir}/${f.name}`))
          if (s.tasks.length > 0 && now - s.updatedAt < STALE_MS) snaps.push(s)
        } catch {}
      }
    } catch {}
    const total = snaps.reduce((n, s) => n + s.tasks.length, 0)

    return (
      <Box flexDirection="column">
        <Text bold>
          {total} background task{total === 1 ? '' : 's'} in {snaps.length}{' '}
          session{snaps.length === 1 ? '' : 's'}
        </Text>
        {snaps.length === 0 && <Text dimColor>Nothing running.</Text>}
        {snaps.map(s => (
          <Box flexDirection="column" marginTop={1}>
            <Text color="cyan">
              {s.cwd || s.sessionId.slice(0, 8)} ({s.sessionId.slice(0, 8)})
            </Text>
            {s.tasks.map(t => (
              <Text>
                {t.status === 'running' ? '▶' : '•'} [{t.type}] {t.description}
              </Text>
            ))}
          </Box>
        ))}
      </Box>
    )
  })
}
