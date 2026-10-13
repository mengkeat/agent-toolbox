---
description: Implement a task in scoped subtasks with progressive commits
argument-hint: "<task>"
---
Implement: ${@}

Inspect the repository and identify the affected code, callers, tests, and existing uncommitted changes. 
Break the task into the subtasks and state each subtask's scope and verification before starting.

For each subtask, delegate using an available subagent when possible. 
Choose and specify one model per subtask: `gpt-6.1-sol` at medium thinking, or `gpt-6.1-luna` at high thinking. 
Keep subtasks independent. If parallel workers would share files or a working tree, run them sequentially. 
If no delegation capability is available, say so and continue with the main agent 
rather than pretending to delegate.

Each worker must stay within its assigned scope, run relevant checks, and make modular progressive commits.

