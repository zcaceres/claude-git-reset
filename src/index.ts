#!/usr/bin/env bun
/**
 * Block destructive git commands (reset --hard, force push, clean -f, etc.).
 * Claude Code PreToolUse hook for the Bash tool.
 */

interface ToolInput {
  tool_input?: {
    command?: string;
  };
}

// Strip quoted text so `echo 'git reset --hard'` is allowed — but keep
// quoted runs that look like a flag (`'--hard'`, `"-fdx"`), since bash strips
// the quotes at exec and those tokens reach git as real arguments.
function stripQuotes(command: string): string {
  let stripped = command.replace(/"((?:[^"\\]|\\.)*)"/g, (_, inner) =>
    /^-/.test(inner) ? inner : '""'
  );
  stripped = stripped.replace(/'([^']*)'/g, (_, inner) =>
    /^-/.test(inner) ? inner : "''"
  );
  return stripped;
}

// Matches a git invocation: bare `git`, `\git`, `/usr/bin/git`, `./git`,
// or wrapped via sudo/command/env/xargs. Anchored to start-of-command or
// after a shell operator so `mygit` and `... echo git ...` don't match.
const OP = String.raw`(?:^|&&|\|\||;|\||\$\(|` + "`" + String.raw`|'|"|\n|\r)`;
const GIT_PATH = String.raw`(?:\\)?(?:/[\w./-]+/)?(?:\.\/)?git\b`;
const GIT = `(?:${OP}\\s*${GIT_PATH}|\\b(?:sudo|command|env|xargs)\\s+(?:/[\\w./-]+/)?git\\b)`;
// Optional run of git's global options between `git` and the subcommand:
// `-C <path>`, `-c key=val`, `--git-dir=…`, `--no-pager`, `-P`, etc.
// Short opts that take a value (-C, -c) are listed explicitly so a bare
// short opt like `-P` doesn't greedily swallow the next token (e.g. `clean`).
const GIT_OPTS = String.raw`(?:\s+(?:-[Cc]\s+\S+|-[A-Za-z]|--[\w-]+(?:=\S+)?))*`;
// Segment boundary: any shell separator (now also newlines).
const SEG = String.raw`[^&;|\n\r]`;

// Each rule: a label (used in the error message) and a regex matching a
// destructive subcommand invocation. `[^&;|]*` keeps matches on a single
// shell segment so `git status; git reset --hard` triggers the second part.
const RULES: { label: string; pattern: RegExp }[] = [
  {
    label: "git reset --hard",
    pattern: new RegExp(`${GIT}${GIT_OPTS}\\s+reset\\b${SEG}*--hard\\b`),
  },
  {
    label: "git push --force / -f",
    pattern: new RegExp(
      `${GIT}${GIT_OPTS}\\s+push\\b${SEG}*(?:--force\\b(?!-with-lease)|\\s-f\\b)`
    ),
  },
  {
    label: "git clean -f",
    pattern: new RegExp(
      `${GIT}${GIT_OPTS}\\s+clean\\b${SEG}*(?:\\s-[a-zA-Z]*f[a-zA-Z]*\\b|--force\\b)`
    ),
  },
  {
    label: "git checkout <path> (worktree discard)",
    pattern: new RegExp(
      `${GIT}${GIT_OPTS}\\s+checkout\\s+(?:\\.(?:\\s|$)|--\\s)`
    ),
  },
  {
    label: "git branch -D / --delete --force",
    pattern: new RegExp(
      `${GIT}${GIT_OPTS}\\s+branch\\b${SEG}*(?:\\s-D\\b|(?:--delete|\\s-d)\\s+(?:${SEG}*\\s)?--force\\b|--force\\s+(?:${SEG}*\\s)?(?:--delete|-d)\\b)`
    ),
  },
  {
    label: "git stash drop/clear",
    pattern: new RegExp(`${GIT}${GIT_OPTS}\\s+stash\\s+(?:drop|clear)\\b`),
  },
  {
    label: "git worktree remove --force",
    pattern: new RegExp(
      `${GIT}${GIT_OPTS}\\s+worktree\\s+remove\\b${SEG}*(?:--force\\b|\\s-f\\b)`
    ),
  },
];

const SUBSHELL = /\b(?:sh|bash|zsh|dash)\s+-c\b/;

function findDestructiveGit(command: string): string | null {
  const stripped = stripQuotes(command);
  for (const { label, pattern } of RULES) {
    if (pattern.test(stripped)) return label;
  }
  // For `bash -c '...'` the dangerous part is intentionally inside quotes;
  // re-run the rules against the unstripped string when a subshell is present.
  if (SUBSHELL.test(command)) {
    for (const { label, pattern } of RULES) {
      if (pattern.test(command)) return label;
    }
  }
  return null;
}

async function main(): Promise<void> {
  try {
    const input = await Bun.stdin.text();
    const data: ToolInput = JSON.parse(input);
    const command = data.tool_input?.command ?? "";

    if (!command) {
      process.exit(0);
    }

    const hit = findDestructiveGit(command);
    if (hit) {
      console.error(
        `BLOCKED: detected destructive git command (${hit}).\n\n` +
          "Safer alternatives:\n" +
          "  - reset --hard      → git stash, or git reset --soft / --mixed\n" +
          "  - push --force      → git push --force-with-lease\n" +
          "  - clean -f          → trash <path> (preserves recovery)\n" +
          "  - checkout <path>   → git restore --source=HEAD --staged <path> after review\n" +
          "  - branch -D         → git branch -d (refuses if unmerged)\n" +
          "  - stash drop/clear  → leave stashes; prune intentionally\n" +
          "  - worktree remove -f → resolve dirty state first, then remove without -f\n\n" +
          "If you genuinely need this, ask the user to run it themselves."
      );
      process.exit(2);
    }

    process.exit(0);
  } catch {
    process.exit(0);
  }
}

main();
