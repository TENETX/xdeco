---
name: plan-management
description: Manage Plan Orchestrator Todos, execution lanes, Codex task bindings, branches, and worktrees. Use when the user asks to capture, queue, start, complete, archive, or inspect a Plan or Todo.
---

# Plan management

Use the Plan Orchestrator MCP tools as the source of truth for task-management operations.

## Concepts

- A **Plan** is an execution lane, not a prose plan. It binds one project, Git branch/worktree, and Codex task.
- The **Capture task** is global and projectless. It is only for turning text or screenshots into Todos.
- A **Todo** has exactly one of these states: `someday` (不急), `waiting` (等待), `queued` (队列中), `running` (运行中), `completed` (完成), or `ended` (结束).
- `completed` is a business decision. A Codex turn finishing does not automatically mean the Todo is complete.
- `ended` is a soft archive for work the user no longer needs. Do not imply that project files or Git history were deleted.

## Workflow

1. When the user asks to open, show, view, or manage the visual Plan/Todo UI, use `open_plan_board`. The component is interactive; avoid repeating its full contents in prose.
2. When the user provides text or a screenshot for lightweight extraction, use `capture_todos`. Preserve useful acceptance criteria and do not invent deadlines or project assignments. The tool owns the global projectless Capture task.
3. Use `create_todo` only when the user has already supplied one explicit Todo that does not need lightweight extraction. Default to `someday` when no Plan was named.
4. Before moving a Todo to `queued`, resolve an explicit Plan. If several Plans plausibly match, ask the user to choose; do not guess.
5. If the Plan points at a worktree path that has not been created yet, use `ensure_plan_worktree`. This creates the configured branch/worktree from `HEAD` by default. Do not call it merely to inspect an existing environment.
6. Distinguish the two execution paths:
   - In the interactive Plan Board, the **current task** action uses `prepare_current_todo`, posts the returned prompt through the Codex host, and calls `register_current_todo` with the returned marker. This is the only path that creates a message visible in the currently open task. The Plan must be bound to that same task so registration can store the exact turn.
   - Use `start_todo` only for CLI/background execution in the Plan-bound task. It launches through the daemon and must not be described as a visible message in the currently open Codex task.
   When a turn begins with a Plan Orchestrator marker and instructs you to call `register_current_todo`, do that before editing files. If registration reports a task-binding mismatch, stop and ask the user to bind the Plan to the current task; do not create another task.
7. Do not mark a Todo `completed` merely because the execution turn ended. Mark it complete only when the user says it is done or the requested acceptance criteria are demonstrably satisfied.
8. Use `complete_todo` so the completion record contains the exact `threadId` and `turnId`. Prefer the latest recorded run by omitting those IDs; pass them explicitly only when completing from another known turn.
9. Use `get_todo_completion` when the user asks where or how a Todo was completed.

## Status rules

- `someday`: captured but not scheduled.
- `waiting`: blocked on a person, decision, dependency, or external event.
- `queued`: assigned to a Plan and ready for its task-scoped queue.
- `running`: registered through `register_current_todo` for a visible current-task run, or launched through `start_todo` for background execution; do not use this state as a generic priority flag.
- `completed`: stores a stable completion receipt for the exact task and turn.
- `ended`: no longer useful; hide it from normal active lists.

Keep confirmations short. Include the Todo title, new status, and Plan name when relevant.
