"use client";

import {
  Check,
  CheckCircle2,
  ChevronLeft,
  CirclePlus,
  CircleAlert,
  Folder,
  GripVertical,
  History,
  Inbox,
  ListTodo,
  LoaderCircle,
  Play,
  Plus,
  RefreshCw,
  Search,
  MessageSquareText,
  Zap,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type CodexThread,
  type Overview,
  type Project,
  type Queue,
  type Todo,
  type TodoResult,
  type TodoStatus,
} from "@xdeco/shared";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const failure = body.error;
    const message = typeof failure === "string" ? failure : failure?.message;
    const recovery = typeof failure === "object" && typeof failure?.recovery === "string" ? ` ${failure.recovery}` : "";
    throw new Error(`${message ?? `请求失败 (${response.status})`}${recovery}`);
  }
  return body as T;
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

function pathContains(rootPath: string, candidatePath: string): boolean {
  const root = rootPath.replaceAll("\\", "/").replace(/\/+$/, "");
  const candidate = candidatePath.replaceAll("\\", "/").replace(/\/+$/, "");
  return Boolean(root) && (candidate === root || candidate.startsWith(`${root}/`));
}

export function Dashboard() {
  const [data, setData] = useState<Overview | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [historyQueueId, setHistoryQueueId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [queueSheetOpen, setQueueSheetOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const refreshPromise = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (refreshPromise.current) return refreshPromise.current;
    if (!silent) setRefreshing(true);
    const request = api<Overview>("/api/overview")
      .then((overview) => {
        setData(overview);
        setError("");
      })
      .catch((reason) => setError(errorMessage(reason)))
      .finally(() => {
        refreshPromise.current = null;
        if (!silent) setRefreshing(false);
      });
    refreshPromise.current = request;
    return request;
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const hasActiveTodos = Boolean(data?.todos.some((todo) => todo.status === "sending" || todo.status === "running"));
  useEffect(() => {
    if (!hasActiveTodos) return;
    const timer = window.setInterval(() => void refresh(true), 2_500);
    return () => window.clearInterval(timer);
  }, [hasActiveTodos, refresh]);

  const project = data?.projects.find((item) => item.id === projectId) ?? null;
  const todos = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return (data?.todos ?? []).filter((todo) => {
      if (projectId && todo.projectId !== projectId) return false;
      return !normalized || `${todo.title} ${todo.description}`.toLocaleLowerCase().includes(normalized);
    });
  }, [data, projectId, query]);
  const poolTodos = todos.filter((todo) => todo.status === "draft" || todo.status === "failed");
  const queues = (data?.queues ?? []).filter((queue) => !projectId || queue.projectId === projectId);
  const queueProjects = (project ? [project] : data?.projects ?? []).filter((candidate) =>
    project || queues.some((queue) => queue.projectId === candidate.id),
  );
  const hasQueueTodos = todos.some((todo) => ["ready", "sending", "running"].includes(todo.status));

  const updateTodo = useCallback((updated: Todo) => {
    setData((current) => current
      ? {
          ...current,
          todos: current.todos.some((todo) => todo.id === updated.id)
            ? current.todos.map((todo) => todo.id === updated.id ? updated : todo)
            : [updated, ...current.todos],
        }
      : current);
  }, []);

  const runMutation = async (key: string, work: () => Promise<void>) => {
    if (mutatingId) return;
    setMutatingId(key);
    setError("");
    try {
      await work();
      void refresh(true);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setMutatingId(null);
    }
  };

  const setStatus = (todo: Todo, status: TodoStatus) => runMutation(todo.id, async () => {
    updateTodo(await api<Todo>(`/api/todos/${todo.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, projectId: todo.projectId }),
    }));
  });

  const queueTodo = (todo: Todo, queueId: string, beforeTodoId?: string | null) => runMutation(todo.id, async () => {
    updateTodo(await api<Todo>(`/api/todos/${todo.id}/queue`, {
      method: "PATCH",
      body: JSON.stringify({ queueId, beforeTodoId: beforeTodoId ?? null }),
    }));
  });

  const moveToPool = (todo: Todo) => setStatus(todo, "draft");

  const activeProjectCount = (id: string | null) => (data?.todos ?? []).filter(
    (todo) => todo.projectId === id && !["completed", "archived"].includes(todo.status),
  ).length;

  return (
    <main className="iosShell">
      <header className="iosNav">
        <div className="navPrimary">
          <div className="appIdentity" aria-label="xdeco">
            <img className="appLogoLockup" src="/brand/xdeco-lockup.png" alt="" />
            <img className="appLogoMark" src="/brand/xdeco-mark.png" alt="" />
          </div>
          <label className="navSearch">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索 Todo" />
          </label>
          <button className="circleButton" type="button" aria-label="刷新" onClick={() => void refresh()}>
            <RefreshCw className={refreshing ? "spin" : ""} size={17} />
          </button>
          <span className={data?.controller.codexAvailable ? "connectionState connected" : "connectionState"}>
            <i />{data?.controller.codexAvailable ? "已连接" : "离线"}
          </span>
        </div>
        <div className="tabRail" role="tablist" aria-label="项目">
          <button className={!projectId ? "projectTab active" : "projectTab"} role="tab" aria-selected={!projectId} onClick={() => setProjectId(null)}>
            <Inbox size={15} /><span>全部</span><em>{(data?.todos ?? []).filter((todo) => todo.status !== "archived").length}</em>
          </button>
          {data?.projects.map((item) => (
            <button key={item.id} className={projectId === item.id ? "projectTab active" : "projectTab"} role="tab" aria-selected={projectId === item.id} onClick={() => setProjectId(item.id)}>
              <i /><span>{item.name}</span><em>{activeProjectCount(item.id)}</em>
            </button>
          ))}
          <button className="addTab" type="button" aria-label="关联共享项目" onClick={() => setSheetOpen(true)}><Plus size={17} /></button>
        </div>
      </header>

      <section className="iosContent">
        {error ? <div className="errorBanner" role="alert"><CircleAlert size={17} /><span>{error}</span><button aria-label="关闭错误提示" onClick={() => setError("")}><X size={15} /></button></div> : null}

        <div className="pageHeading">
          <div className="pageTitle">
            <h1>{project?.name ?? "Todo"}</h1>
          </div>
          <div className="pageActions">
            {project ? <button className="secondaryButton newQueueButton" type="button" onClick={() => setQueueSheetOpen(true)}><MessageSquareText size={15} />新建队列</button> : null}
            <button className="primaryButton newTodoButton" type="button" aria-label="新建 Todo" onClick={() => setComposerOpen(true)}>
              <Plus size={16} /><span>新建 Todo</span>
            </button>
          </div>
        </div>

        {!data ? <LoadingList /> : poolTodos.length || hasQueueTodos || project ? (
          <div className="workflowSurface">
            <QueueBoard
              projects={queueProjects}
              queues={queues}
              threads={data.codexThreads}
              todos={todos}
              showProject={!projectId}
              busy={Boolean(mutatingId)}
              onQueue={queueTodo}
              onMoveToPool={moveToPool}
              onHistory={(queueId) => setHistoryQueueId(queueId)}
            />
            <TodoPool
              todos={poolTodos}
              allTodos={todos}
              projects={data.projects}
              queues={data.queues}
              showProject={!projectId}
              mutatingId={mutatingId}
              onQueue={queueTodo}
              onMoveToPool={moveToPool}
            />
          </div>
        ) : (
          <div className="iosEmpty">
            <span><Check size={22} /></span>
            <h2>{query ? "没有匹配项" : "暂无 Todo"}</h2>
            {query ? (
              <button className="secondaryButton emptyTodoButton" type="button" onClick={() => setQuery("")}>清除搜索</button>
            ) : (
              <p>可从右上角新建 Todo</p>
            )}
          </div>
        )}
      </section>

      {composerOpen ? (
        <TodoComposerSheet
          projects={data?.projects ?? []}
          queues={data?.queues ?? []}
          threads={data?.codexThreads ?? []}
          selectedProjectId={projectId}
          onClose={() => setComposerOpen(false)}
          onCreated={(todo) => {
            updateTodo(todo);
            setProjectId(todo.projectId);
            setComposerOpen(false);
            void refresh(true);
          }}
          onError={setError}
        />
      ) : null}
      {sheetOpen ? <ProjectSheet data={data} onClose={() => setSheetOpen(false)} onCreated={async (created) => { await refresh(true); setProjectId(created.id); setSheetOpen(false); }} onError={setError} /> : null}
      {queueSheetOpen && project ? <QueueSheet project={project} threads={data?.codexThreads ?? []} onClose={() => setQueueSheetOpen(false)} onCreated={async () => { await refresh(true); setQueueSheetOpen(false); }} onError={setError} /> : null}
      {historyQueueId ? <CompletionArchive todos={todos.filter((todo) => todo.queueId === historyQueueId && todo.status === "completed").sort((a, b) => (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt))} onClose={() => setHistoryQueueId(null)} /> : null}
    </main>
  );
}

function QueueSheet({ project, threads, onClose, onCreated, onError }: { project: Project; threads: CodexThread[]; onClose: () => void; onCreated: () => Promise<void>; onError: (value: string) => void }) {
  const matchingThreads = threads.filter((thread) => pathContains(project.rootPath, thread.cwd));
  const [threadId, setThreadId] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api<Queue>("/api/queues", { method: "POST", body: JSON.stringify({ projectId: project.id, targetThreadId: threadId || null }) });
      await onCreated();
    } catch (reason) { onError(errorMessage(reason)); setBusy(false); }
  };
  return <div className="sheetBackdrop composerBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="projectSheet" role="dialog" aria-modal="true" aria-labelledby="queueSheetTitle">
      <div className="sheetHandle" />
      <header><button className="sheetTextButton" type="button" disabled={busy} onClick={onClose}>取消</button><h2 id="queueSheetTitle">新建队列</h2><button className="sheetTextButton strong" type="button" disabled={busy} onClick={() => void submit()}>完成</button></header>
      <p className="sheetIntro">每个队列绑定一个 Codex 对话，并在其中顺序执行。</p>
      <div className="formGroup"><div className="formRow"><span>关联对话</span><AppSelect ariaLabel="队列关联对话" value={threadId || "__new__"} onValueChange={(value) => setThreadId(value === "__new__" ? "" : value)} options={[{ value: "__new__", label: "新建对话", description: "首次执行时自动创建", kind: "create" }, ...matchingThreads.map((thread) => ({ value: thread.id, label: thread.name }))]} variant="row" /></div></div>
    </section>
  </div>;
}

function TodoComposerSheet({ projects, queues, threads, selectedProjectId, onClose, onCreated, onError }: { projects: Project[]; queues: Queue[]; threads: CodexThread[]; selectedProjectId: string | null; onClose: () => void; onCreated: (todo: Todo) => void; onError: (value: string) => void }) {
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState(selectedProjectId ?? "");
  const [queueId, setQueueId] = useState("");
  const [busy, setBusy] = useState(false);
  const projectQueues = queues.filter((queue) => queue.projectId === projectId);

  useEffect(() => {
    if (!projectId || queueId || !projectQueues[0]) return;
    setQueueId(projectQueues[0].id);
  }, [projectId, queueId, projectQueues]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, onClose]);

  const add = async (ready: boolean) => {
    if (!title.trim() || (ready && !queueId) || busy) return;
    setBusy(true);
    try {
      const response = await api<{ todo: Todo }>("/api/todos", {
        method: "POST",
        body: JSON.stringify({ title: title.trim(), projectId: projectId || null, queueId: queueId || null, status: ready ? "ready" : "draft" }),
      });
      setTitle("");
      onCreated(response.todo);
    } catch (reason) {
      onError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sheetBackdrop composerBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className="todoComposerSheet" role="dialog" aria-modal="true" aria-labelledby="todoComposerTitle">
        <div className="sheetHandle" />
        <header className="todoComposerHeader">
          <button className="sheetTextButton" type="button" disabled={busy} onClick={onClose}>取消</button>
          <h2 id="todoComposerTitle">新建 Todo</h2>
          <span />
        </header>
        <div className="composerForm">
          <textarea autoFocus aria-label="Todo 内容" value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void add(Boolean(queueId)); }} placeholder="写下一件事…" rows={5} />
          {!selectedProjectId ? <div className="composerProjectRow">
            <span>项目</span>
            <AppSelect
              ariaLabel="Todo 所属项目"
              value={projectId || "__inbox__"}
              onValueChange={(value) => { const nextProjectId = value === "__inbox__" ? "" : value; setProjectId(nextProjectId); setQueueId(queues.find((queue) => queue.projectId === nextProjectId)?.id ?? ""); }}
              options={[{ value: "__inbox__", label: "Inbox" }, ...projects.map((item) => ({ value: item.id, label: item.name }))]}
              variant="row"
            />
          </div> : null}
          {projectId ? <div className="composerProjectRow">
            <span>队列</span>
            <AppSelect ariaLabel="Todo 执行队列" value={queueId || "__pool__"} onValueChange={(value) => setQueueId(value === "__pool__" ? "" : value)} options={[{ value: "__pool__", label: "暂不排队" }, ...projectQueues.map((queue) => ({ value: queue.id, label: queueLabel(queue, threads) }))]} variant="row" />
          </div> : null}
        </div>
        <div className="composerActions">
          <button className="secondaryButton" type="button" disabled={busy || !title.trim()} onClick={() => void add(false)}>创建</button>
          <button className="primaryButton" type="button" disabled={busy || !title.trim() || !queueId} onClick={() => void add(true)}>
            {busy ? <LoaderCircle className="spin" size={16} /> : <Play size={15} />}创建并排队
          </button>
        </div>
        <p className="composerHint">⌘ Enter 快速提交</p>
      </section>
    </div>
  );
}

function queueLabel(queue: Queue, threads: CodexThread[]): string {
  return queue.name ?? threads.find((thread) => thread.id === queue.targetThreadId)?.name ?? "新建对话";
}

const TODO_DRAG_TYPE = "application/x-xdeco-todo";

function dragTodo(event: React.DragEvent, todo: Todo): void {
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(TODO_DRAG_TYPE, todo.id);
  event.dataTransfer.setData("text/plain", todo.id);
}

function droppedTodoId(event: React.DragEvent): string {
  return event.dataTransfer.getData(TODO_DRAG_TYPE) || event.dataTransfer.getData("text/plain");
}

function QueueBoard({ projects, queues, threads, todos, showProject, busy, onQueue, onMoveToPool, onHistory }: { projects: Project[]; queues: Queue[]; threads: CodexThread[]; todos: Todo[]; showProject: boolean; busy: boolean; onQueue: (todo: Todo, queueId: string, beforeTodoId?: string | null) => Promise<void>; onMoveToPool: (todo: Todo) => Promise<void>; onHistory: (queueId: string) => void }) {
  return (
    <section className="queueBoard" aria-labelledby="queueTitle">
      <header className="workflowHeader">
        <div><h2 id="queueTitle">执行队列</h2><span>拖动 Todo 插入任意一节</span></div>
      </header>
      <div className="queueLanes">
        {projects.map((project) => {
          const projectQueues = queues.filter((queue) => queue.projectId === project.id);
          return (
            <div className="projectQueueGroup" key={project.id}>
              {showProject ? <div className="queueProject"><span>{project.name}</span><em>{projectQueues.length} 个队列</em></div> : null}
              {projectQueues.length ? projectQueues.map((queue) => <QueueLane key={queue.id} queue={queue} threads={threads} active={todos.find((todo) => todo.queueId === queue.id && (todo.status === "sending" || todo.status === "running")) ?? null} queued={todos.filter((todo) => todo.queueId === queue.id && todo.status === "ready")} completed={todos.filter((todo) => todo.queueId === queue.id && todo.status === "completed")} allTodos={todos} busy={busy} onQueue={onQueue} onMoveToPool={onMoveToPool} onHistory={onHistory} />) : <div className="queueEmpty">还没有队列</div>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function QueueLane({ queue, threads, active, queued, completed, allTodos, busy, onQueue, onMoveToPool, onHistory }: { queue: Queue; threads: CodexThread[]; active: Todo | null; queued: Todo[]; completed: Todo[]; allTodos: Todo[]; busy: boolean; onQueue: (todo: Todo, queueId: string, beforeTodoId?: string | null) => Promise<void>; onMoveToPool: (todo: Todo) => Promise<void>; onHistory: (queueId: string) => void }) {
  const [dropBefore, setDropBefore] = useState<string | null | undefined>(undefined);
  const acceptDrop = (event: React.DragEvent, beforeTodoId: string | null) => {
    event.preventDefault();
    if (busy) return;
    const todo = allTodos.find((candidate) => candidate.id === droppedTodoId(event));
    setDropBefore(undefined);
    if (!todo || todo.id === beforeTodoId || todo.status === "sending" || todo.status === "running") return;
    void onQueue(todo, queue.id, beforeTodoId);
  };
  return (
    <div className="queueLane">
      <div className="queueLaneHeader"><MessageSquareText size={14} /><strong>{queueLabel(queue, threads)}</strong><span>{queued.length + (active ? 1 : 0)}</span></div>
      <div className={active || queued.length ? "train hasItems" : "train empty"} aria-label={`${queueLabel(queue, threads)} 执行队列`}>
        <div className={active ? "trainHead running" : "trainHead idle"}>
          <Zap size={17} />
          <span className="queueTooltip" role="tooltip">
            <strong>{active?.title ?? "等待下一项"}</strong>
            <small>{active ? "正在执行" : "队列空闲"}</small>
          </span>
        </div>
        {active ? <span className="trainCoupler active" /> : null}
        {queued.map((todo, index) => (
          <div className="trainUnit" key={todo.id}>
            <QueueDropSlot
              active={dropBefore === todo.id}
              onEnter={() => setDropBefore(todo.id)}
              onDrop={(event) => acceptDrop(event, todo.id)}
            />
            <button
              className="queueCar"
              type="button"
              draggable={!busy}
              aria-label={`${todo.title}，队列第 ${index + 1} 项`}
              onDragStart={(event) => dragTodo(event, todo)}
              onDoubleClick={() => void onMoveToPool(todo)}
            >
              <GripVertical size={13} />
              <span>{index + 1}</span>
              <span className="queueTooltip" role="tooltip"><strong>{todo.title}</strong><small>双击移出队列</small></span>
            </button>
            <span className="trainCoupler" />
          </div>
        ))}
        <QueueDropSlot
          active={dropBefore === null}
          empty={!queued.length}
          onEnter={() => setDropBefore(null)}
          onDrop={(event) => acceptDrop(event, null)}
        />
        {completed.length ? <button className="queueHistoryButton" type="button" aria-label={`查看 ${queueLabel(queue, threads)} 的 ${completed.length} 条完成记录`} onClick={() => onHistory(queue.id)}><History size={15} /><span>{completed.length}</span></button> : null}
      </div>
    </div>
  );
}

function QueueDropSlot({ active, empty, onEnter, onDrop }: { active: boolean; empty?: boolean; onEnter: () => void; onDrop: (event: React.DragEvent) => void }) {
  return (
    <div
      className={`queueDropSlot${active ? " active" : ""}${empty ? " empty" : ""}`}
      onDragEnter={(event) => { event.preventDefault(); onEnter(); }}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
      onDrop={onDrop}
    >
      {empty ? <span>拖到这里</span> : null}
    </div>
  );
}

function TodoPool({ todos, allTodos, projects, queues, showProject, mutatingId, onQueue, onMoveToPool }: { todos: Todo[]; allTodos: Todo[]; projects: Project[]; queues: Queue[]; showProject: boolean; mutatingId: string | null; onQueue: (todo: Todo, queueId: string, beforeTodoId?: string | null) => Promise<void>; onMoveToPool: (todo: Todo) => Promise<void> }) {
  return (
    <section
      className="todoPool"
      aria-labelledby="todoPoolTitle"
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
      onDrop={(event) => {
        event.preventDefault();
        const todo = allTodos.find((candidate) => candidate.id === droppedTodoId(event));
        if (todo?.status === "ready") void onMoveToPool(todo);
      }}
    >
      <header className="workflowHeader"><div><h2 id="todoPoolTitle">Todo</h2><span>{todos.length}</span></div></header>
      {todos.length ? (
        <div className="poolList">
          {todos.map((todo) => {
            const project = projects.find((item) => item.id === todo.projectId) ?? null;
            const projectQueues = queues.filter((queue) => queue.projectId === todo.projectId);
            const busy = mutatingId === todo.id;
            return (
              <article className={`poolTodo${todo.status === "failed" ? " failed" : ""}`} key={todo.id} draggable={!busy} onDragStart={(event) => dragTodo(event, todo)}>
                <GripVertical className="poolGrip" size={16} />
                <div className="poolCopy">
                  <h3>{todo.title}</h3>
                  {todo.description ? <p>{todo.description}</p> : null}
                  {todo.lastError ? <p className="todoError">{todo.lastError}</p> : null}
                  {showProject ? <span className="projectName"><Folder size={11} />{project?.name ?? "未分项目"}</span> : null}
                </div>
                <div className="poolActions">
                  <button className="queueTodoButton" type="button" disabled={busy || projectQueues.length !== 1} aria-label={projectQueues.length === 1 ? `将 ${todo.title} 加入队列` : "请拖到目标队列"} onClick={() => { if (projectQueues[0]) void onQueue(todo, projectQueues[0].id); }}>
                    {busy ? <LoaderCircle className="spin" size={15} /> : <CirclePlus size={16} />}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : <div className="poolEmpty"><ListTodo size={18} /><span>没有待处理 Todo</span></div>}
    </section>
  );
}

function CompletionArchive({ todos, onClose }: { todos: Todo[]; onClose: () => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, TodoResult>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const openResult = async (todo: Todo) => {
    setSelectedId(todo.id);
    setError("");
    if (results[todo.id] || !todo.completionThreadId) return;
    setLoadingId(todo.id);
    try {
      const result = await api<TodoResult>(`/api/todos/${todo.id}/result`);
      setResults((current) => ({ ...current, [todo.id]: result }));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoadingId(null);
    }
  };
  const selectedTodo = todos.find((todo) => todo.id === selectedId) ?? null;
  const selectedResult = selectedTodo ? results[selectedTodo.id] : null;

  return (
    <div className="sheetBackdrop composerBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="historySheet" role="dialog" aria-modal="true" aria-labelledby="historyTitle">
        <div className="sheetHandle" />
        <header className="historyHeader">
          <button className="sheetTextButton historyBackButton" type="button" onClick={() => { if (selectedTodo) { setSelectedId(null); setError(""); } else onClose(); }}><ChevronLeft size={17} />返回</button>
          <h2 id="historyTitle">{selectedTodo ? "执行结果" : "已完成"}</h2>
          <span />
        </header>
        {error ? <div className="historyError" role="alert">{error}</div> : null}
        {selectedTodo ? <div className="historyDetail">
          <div className="historyDetailQuery"><small>Todo</small><h3>{selectedTodo.title}</h3><time>{selectedTodo.completedAt ? new Date(selectedTodo.completedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "已完成"}</time></div>
          {loadingId === selectedTodo.id ? <div className="historyLoading"><LoaderCircle className="spin" size={16} />读取结果</div> : selectedResult ? <><div className="markdownBody compact" dangerouslySetInnerHTML={{ __html: selectedResult.answerHtml }} />{selectedResult.artifacts.length ? <ul className="historyArtifacts">{selectedResult.artifacts.map((artifact) => <li key={artifact.uri}><strong>{artifact.name}</strong><code>{artifact.uri}</code></li>)}</ul> : null}</> : <p className="historyResultEmpty">这次执行没有可读取的结果。</p>}
        </div> : todos.length ? <ol className="historyTimeline">
          {todos.map((todo) => <li key={todo.id}><button type="button" onClick={() => void openResult(todo)}><time>{todo.completedAt ? new Date(todo.completedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "已完成"}</time><span className="historyTimelineDot"><Check size={10} /></span><strong>{todo.title}</strong></button></li>)}
        </ol> : <div className="historyEmpty"><CheckCircle2 size={22} /><span>还没有完成记录</span></div>}
      </section>
    </div>
  );
}

function LoadingList() {
  return <div className="loadingGroups" aria-label="正在加载"><span /><span /><span /></div>;
}

function ProjectSheet({ data, onClose, onCreated, onError }: { data: Overview | null; onClose: () => void; onCreated: (project: Project) => Promise<void>; onError: (value: string) => void }) {
  const first = data?.codexProjects[0];
  const [rootPath, setRootPath] = useState(first?.rootPath ?? "");
  const [threadId, setThreadId] = useState("");
  const [busy, setBusy] = useState(false);
  const sharedProject = data?.codexProjects.find((item) => item.rootPath === rootPath) ?? null;
  const projectThreads = useMemo(
    () => (data?.codexThreads ?? []).filter((thread) => pathContains(rootPath, thread.cwd)),
    [data?.codexThreads, rootPath],
  );

  const submit = async () => {
    if (busy || !sharedProject) return;
    setBusy(true);
    try {
      await onCreated(await api<Project>("/api/projects", { method: "POST", body: JSON.stringify({ name: sharedProject.name, rootPath: sharedProject.rootPath, targetThreadId: threadId || null, autoDispatch: true }) }));
    } catch (reason) {
      onError(errorMessage(reason));
      setBusy(false);
    }
  };

  return (
    <div className="sheetBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="projectSheet" role="dialog" aria-modal="true" aria-labelledby="projectSheetTitle">
        <div className="sheetHandle" />
        <header><button className="sheetTextButton" onClick={onClose}>取消</button><h2 id="projectSheetTitle">关联共享项目</h2><button className="sheetTextButton strong" disabled={busy || !sharedProject} onClick={() => void submit()}>完成</button></header>
        <p className="sheetIntro">选择共享项目；也可以顺手创建第一个队列。</p>
        <div className="formGroup">
          <div className="formRow"><span>共享项目</span><AppSelect ariaLabel="共享项目" value={rootPath || "__none__"} onValueChange={(value) => { setRootPath(value === "__none__" ? "" : value); setThreadId(""); }} options={[{ value: "__none__", label: "选择共享项目" }, ...(data?.codexProjects.map((item) => ({ value: item.rootPath, label: item.name })) ?? [])]} variant="row" /></div>
          <div className="formRow"><span>第一个队列</span><AppSelect ariaLabel="第一个队列关联的 Codex 对话" value={threadId || "__new__"} disabled={!sharedProject} onValueChange={(value) => setThreadId(value === "__new__" ? "" : value)} options={[{ value: "__new__", label: "新建对话", description: "首次执行时自动创建", kind: "create" }, ...projectThreads.map((thread) => ({ value: thread.id, label: thread.name }))]} variant="row" /></div>
        </div>
      </section>
    </div>
  );
}

type AppSelectOption = { value: string; label: string; description?: string; kind?: "create" };

function AppSelect({ ariaLabel, value, options, variant, disabled, onValueChange }: { ariaLabel: string; value: string; options: AppSelectOption[]; variant: "compact" | "row" | "mode" | "status" | "thread"; disabled?: boolean; onValueChange: (value: string) => void }) {
  const selectedOption = options.find((option) => option.value === value);
  return (
    <Select value={value} disabled={disabled} onValueChange={onValueChange}>
      <SelectTrigger className={`xdecoSelectTrigger ${variant}`} aria-label={ariaLabel}>
        <SelectValue>{selectedOption?.label}</SelectValue>
      </SelectTrigger>
      <SelectContent className="xdecoSelectContent" position="popper" align={variant === "compact" ? "start" : "end"}>
        {options.map((option, index) => [
          <SelectItem className={`xdecoSelectItem${option.kind === "create" ? " createOptionItem" : ""}`} key={option.value} value={option.value}>
            {option.kind === "create" ? (
              <span className="createOption">
                <span className="createOptionGlyph"><Plus size={14} /></span>
                <span><strong>{option.label}</strong><small>{option.description}</small></span>
              </span>
            ) : option.label}
          </SelectItem>,
          option.kind === "create" && index < options.length - 1 ? <SelectSeparator className="xdecoSelectSeparator" key={`${option.value}-separator`} /> : null,
        ])}
      </SelectContent>
    </Select>
  );
}
