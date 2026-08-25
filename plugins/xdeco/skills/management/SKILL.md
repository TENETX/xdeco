---
name: management
description: Manage xdeco projects and Todo queues. Use when the user asks to remember, add, queue, send, retry, complete, archive, or inspect a Todo or project.
---

# xdeco management

Use xdeco tools as the source of truth for project and Todo operations.

## Concepts

- A **Project** groups Todos and points to one destination Codex task. It does not manage Git branches or worktrees.
- A Project sends ready Todos sequentially. Only one Todo per Project may be sending or running at a time.
- Todo states are `draft`, `ready`, `sending`, `running`, `completed`, `failed`, and `archived`.
- `sending` and `running` are dispatcher-owned states. Do not set them directly.

## Decisions

1. Use `open_xdeco` when the user asks to view or manage the visual workspace.
2. Use `add_todo` for a single explicit Todo, including when the request comes from a conversation unrelated to the destination Project.
3. Default new Todos to `draft`. Use `ready` only when the user explicitly asks to send, queue, start, or add it to the sending plan.
4. Resolve a Project using an explicit ID or exact name. If several projects are plausible, ask the user instead of guessing.
5. Use `capture_todos` when text or a screenshot should be split or rewritten into multiple Todos. Captured Todos remain drafts.
6. Moving a Todo to `ready` enters its Project queue. If automatic dispatch is enabled, xdeco starts it; otherwise use `start_project_queue` when the user asks to begin.
7. A failed Todo pauses later ready Todos in that Project. Use `retry_todo` only when the user asks to retry or resume that failure.
8. Use `archived` for items the user no longer wants in normal views. Archiving does not delete project files or Codex history.

Keep confirmations short: include the Todo title, Project name when assigned, and whether it was saved as a draft or entered the send queue.
