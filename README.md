# agent-toolbox

Personal collection of skills, scripts, templates, and extensions for AI coding agents.

## Skills

Reference guides loaded by an agent at runtime to steer its behavior on a specific task.

| Skill | Description |
|-------|-------------|
| [bun](skills/bun/) | Initialize projects, manage dependencies, run scripts, tests, and bundle code using Bun |
| [commit](skills/commit/) | Create git commits using Conventional Commits format |
| [files](skills/files/) | List files in the current git tree with quick actions (reveal, open, edit, diff) |
| [github](skills/github/) | Interact with GitHub using the `gh` CLI (issues, PRs, CI runs, API) |
| [mermaid](skills/mermaid/) | Validate Mermaid diagrams using the official Mermaid CLI |
| [simplify](skills/simplify/) | Review changed files for reuse, quality, and efficiency; fix issues found |
| [summarize](skills/summarize/) | Fetch URLs or convert files (PDF, DOCX, HTML, etc.) into Markdown using `markitdown` |
| [tmux](skills/tmux/) | Remote control tmux sessions for interactive CLIs (python, gdb, etc.) |
| [update-changelog](skills/update-changelog/) | Update repository changelogs with changes since the last release |
| [uv](skills/uv/) | Use `uv` instead of pip/python/venv for Python dependency management |
| [web-browser](skills/web-browser/) | Interact with web pages via Chrome DevTools Protocol (click, fill, navigate) |

## Pi-Extensions

TypeScript/Python extensions for augmenting agent sessions — includes tools for cost tracking, context management, notification, multi-edit workflows, and more.
