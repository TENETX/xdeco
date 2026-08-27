import assert from "node:assert/strict";
import test from "node:test";
import { publicError } from "./errors.js";

test("turns duplicate project storage failures into an actionable message", () => {
  assert.deepEqual(publicError(new Error("UNIQUE constraint failed: projects.name")), {
    code: "project_exists",
    message: "这个共享项目已经关联过了",
    recovery: "直接在上方项目标签中打开它即可。",
  });
});

test("does not expose unknown internal failures", () => {
  assert.deepEqual(publicError(new Error("SQLITE_IOERR: disk I/O error")), {
    code: "operation_failed",
    message: "操作未完成",
    recovery: "请稍后重试；如果仍失败，请刷新页面。",
  });
});

test("explains why an active queue cannot be deleted", () => {
  assert.deepEqual(publicError(new Error("Cannot delete a Queue while a Todo is sending or running")), {
    code: "queue_running",
    message: "正在执行的队列不能删除",
    recovery: "等待当前 Todo 完成后再试。",
  });
});
