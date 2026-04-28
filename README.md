# Block Destructive Git Commands

A Claude Code hook that blocks destructive git commands — `git reset --hard`, force pushes, force cleans, force branch deletions — while letting safer alternatives through.

> **Note:** This is a best-effort pattern matcher, not a comprehensive sandbox. There will always be creative ways to invoke git that aren't covered. Use this as one layer of defense, not the only one.

## Blocked Patterns

| Class | Examples |
|---|---|
| `git reset --hard` | any target — `HEAD`, commit SHAs, branches, refs |
| `git push --force` / `-f` | unconditional force push (`--force-with-lease` is allowed) |
| `git clean -f*` / `--force` | `-f`, `-fd`, `-fdx`, `-xf`, `--force` |
| `git checkout <path>` | `git checkout .`, `git checkout -- file` (worktree-discard form) |
| `git branch -D` / `--delete --force` | force-deleting unmerged branches |
| `git stash drop` / `clear` | dropping individual stashes or clearing the list |
| `git worktree remove --force` / `-f` | force-removing dirty worktrees |

### Bypass coverage

- Path variants: `/usr/bin/git`, `./git`, `\git`
- Wrappers: `sudo git`, `command git`, `env git`, `xargs git`
- Subshells: `sh -c '...'`, `bash -c '...'`, `zsh -c '...'`, `dash -c '...'`
- Chained: `cmd && git reset --hard`, `cmd; git push --force`, etc.

## Allowed (explicitly)

- `git reset` (no flag), `git reset --soft`, `git reset --mixed`
- `git push --force-with-lease`, `git push --force-with-lease=ref:expected`
- `git checkout main`, `git checkout -b feature`
- `git clean -n` / `--dry-run`
- `git stash`, `git stash push`, `git stash pop`, `git stash apply`
- `git branch -d merged-branch` (refuses if unmerged)
- Quoted strings: `echo 'git reset --hard'`, `git commit -m "fix reset --hard bug"`

## Installation

### 1. Install Bun

```bash
curl -fsSL https://bun.sh/install | bash
```

### 2. Clone and install

```bash
git clone <repo-url>
cd claude-git-reset
bun install
```

### 3. Configure Claude Code

Add to your `.claude/settings.json` or `.claude/settings.local.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bun run /path/to/claude-git-reset/src/index.ts"
          }
        ]
      }
    ]
  }
}
```

Replace `/path/to/claude-git-reset` with the actual path, or use `$CLAUDE_PROJECT_DIR` if installing per-project.

You can stack this alongside `claude-rm-rf` — both hooks run on every Bash call and either can block.

## Development

```bash
bun test
bun run build   # standalone executable, ~60MB
```

## How It Works

The hook runs on every `Bash` tool call via `PreToolUse`:

1. Read JSON from stdin (`tool_input.command`).
2. Strip quoted strings to avoid false positives on `echo 'git reset --hard'`.
3. For each blocked class, run a regex anchored to a "git invocation" — start of command, after a shell operator, or behind a known wrapper (`sudo`, `command`, `env`, `xargs`).
4. For `bash -c '...'` style subshells, re-run the rules against the *original* (unstripped) command, since the dangerous part is intentionally inside quotes.
5. On match: exit 2 with a `BLOCKED:` message identifying the rule and listing safer alternatives.
6. Otherwise: exit 0 to allow.

Inspired by and structured after [`claude-rm-rf`](../claude-rm-rf).
