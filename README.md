# bg-tasks

A Claude Code mod that adds a pane listing the background tasks (shells, subagents, monitors) Claude is running, across every session on your machine.

Each session with the mod loaded writes a snapshot of its in-flight tasks to `~/.claude/background-tasks/`. The pane reads all of those snapshots, grouped by working directory, and redraws every few seconds. A snapshot refreshes when a turn ends, and when a background Bash or Agent call starts. Sessions without the mod loaded are not shown.

## Install

At the prompt of a terminal session:

```
/plugin install bg-tasks --marketplace Yuds16/bg-tasks
```

## License

MIT
