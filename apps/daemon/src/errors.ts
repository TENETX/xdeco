export interface PublicError {
  code: string;
  message: string;
  recovery?: string;
}

/** Keep storage and transport details out of every user-facing surface. */
export function publicError(reason: unknown): PublicError {
  const raw = reason instanceof Error ? reason.message : String(reason ?? "");
  if (/UNIQUE constraint failed: projects\.name/i.test(raw)) {
    return { code: "project_exists", message: "这个共享项目已经关联过了", recovery: "直接在上方项目标签中打开它即可。" };
  }
  if (/different shared project already uses this name/i.test(raw)) {
    return { code: "project_name_taken", message: "已有另一个共享项目使用这个名称", recovery: "请在 Codex 中区分项目名称后再关联。" };
  }
  if (/UNIQUE constraint failed: queues\.project_id, queues\.target_thread_id/i.test(raw)) {
    return { code: "queue_exists", message: "这个对话已经有对应队列", recovery: "请直接使用已有队列，或选择另一个对话。" };
  }
  if (/Project not found/i.test(raw)) return { code: "project_not_found", message: "关联项目已不存在", recovery: "刷新后重新选择项目。" };
  if (/Queue not found/i.test(raw)) return { code: "queue_not_found", message: "目标队列已不存在", recovery: "刷新后重新选择队列。" };
  if (/Todo not found/i.test(raw)) return { code: "todo_not_found", message: "这个 Todo 已不存在", recovery: "刷新列表后重试。" };
  if (/Queue does not belong/i.test(raw)) return { code: "queue_project_mismatch", message: "这个队列不属于所选项目", recovery: "请把 Todo 拖到同一项目下的队列。" };
  if (/Ready todos must belong/i.test(raw)) return { code: "queue_required", message: "请先选择一个执行队列", recovery: "没有队列时，先在项目中创建队列。" };
  if (/sending and running are managed/i.test(raw)) return { code: "todo_running", message: "执行状态由队列自动更新", recovery: "请等待当前任务结束。" };
  if (/Cannot change the mode of a running/i.test(raw)) return { code: "mode_locked", message: "执行中的 Todo 不能修改模式", recovery: "等待任务结束后再调整。" };
  if (/This Todo cannot be moved into the queue/i.test(raw)) return { code: "todo_locked", message: "这个 Todo 当前不能移动", recovery: "已完成或执行中的任务不能重新排队。" };
  if (/Queue insertion target not found/i.test(raw)) return { code: "queue_stale", message: "队列刚刚发生变化", recovery: "刷新后再拖入目标位置。" };
  if (/does not have a completion result/i.test(raw)) return { code: "result_unavailable", message: "这个 Todo 还没有可读取的结果" };
  if (/Codex App Server|codex app-server/i.test(raw)) return { code: "codex_unavailable", message: "暂时无法连接 Codex", recovery: "确认 Codex 已打开后重试。" };
  return { code: "operation_failed", message: "操作未完成", recovery: "请稍后重试；如果仍失败，请刷新页面。" };
}
