---
name: management
description: Manage xdeco projects, Codex-task queues, and Todos. Use when the user asks to open xdeco, add or send a Todo, manage a queue, retry work, or inspect completed results.
---

# xdeco management

Use xdeco tools as the source of truth for projects, queues, Todos, and completion results.

## Concepts

- A **Project** is the outer grouping and maps to one local Codex project root.
- A Project can contain several **Queues**. Each Queue is bound to exactly one Codex task and executes its Todos sequentially.
- Todo states are `draft`, `ready`, `sending`, `running`, `completed`, `failed`, and `archived`.
- The app UI sends execution messages through the Codex host. The daemon records and watches the resulting visible turn; it must not create a second background turn for the same Todo.

## Decisions

1. Use `open_xdeco` when the user asks to open, show, or manage the visual xdeco workspace.
2. Use `add_todo` for saved drafts. Use `create_current_todo` when the Todo should be sent to Codex now.
3. `create_current_todo` returns a `payload`, `targetThreadId`, `todo`, and `marker`. When working without the visual app, deliver `payload` unchanged with the Codex `send_message_to_thread` tool, then call `register_current_todo` with the returned Todo ID and marker.
4. When the xdeco UI sends a relay instruction, call `send_message_to_thread` exactly once with the requested target task and the payload unchanged. Do not execute the payload in the relay task and do not add commentary to the payload.
5. Use `capture_todos` when text or a screenshot should be split or rewritten into draft Todos.
6. Resolve Projects and Queues by explicit ID or exact name. If several are plausible, ask instead of guessing.
7. Use `retry_todo` only when the user asks to retry a failed Todo. Host-native retries must be prepared and registered just like first execution.
8. Use `archived` for items the user no longer wants in normal views. Archiving does not delete project files or Codex history.

Keep confirmations short: include the Todo title, Project or Queue when useful, and whether it was saved or sent.
