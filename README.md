# claude-git-reset — archived

> **This repo is archived.** The hook has moved into [`zcaceres/skills`](https://github.com/zcaceres/skills)
> as the `safety-git-reset-guard` skill, with pre-built binaries (no `bun` runtime
> dependency on the host) and a self-wiring install script.

## New home

- **Skill:** [`zcaceres/skills/skills/safety-git-reset-guard`](https://github.com/zcaceres/skills/tree/main/skills/safety-git-reset-guard)
- **Install:**
  ```sh
  npx skills add zcaceres/skills -s safety-git-reset-guard -g
  ~/.claude/skills/safety-git-reset-guard/scripts/install.sh
  ```
- The second step wires the PreToolUse:Bash hook into `~/.claude/settings.json`
  with a timestamped backup. Idempotent — re-running is a no-op.

## Why the move

This repo shipped a TypeScript hook that required `bun` on every host and a
manual settings.json patch. The skills-repo version:

- Ships pre-built binaries per OS/arch in `scripts/bin/`, dispatched by
  `scripts/run.sh` — no `bun` install required for end users.
- Bundles a `scripts/install.sh` that handles the settings.json wiring
  idempotently with backups.
- Lives next to the other safety hooks (`safety-rm-rf-guard`,
  `safety-dotenv-guard`, `safety-op-creds`) for one consistent install path.

Same blocked / allowed pattern set as documented previously, same caveat:
this is one layer of defense, not a sandbox.

## Migrating from this repo

If you previously wired the hook from `/path/to/claude-git-reset/src/index.ts`:

1. Remove that entry from `.claude/settings.json` (it's a one-line PreToolUse
   command hook). Keep a backup first.
2. Run the two install commands above.

The skills-repo install drops a pointer into the same `PreToolUse:Bash` slot.
