"use client";

import Link from "next/link";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  CirclePlus,
  CircleAlert,
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
  TODO_MODE_META,
  TODO_MODES,
  type CodexThread,
  type Overview,
  type Project,
  type Todo,
  type TodoMode,
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
  if (!response.ok) throw new Error(body.error ?? `请求失败 (${response.status})`);
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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
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
  const completedTodos = todos
    .filter((todo) => todo.status === "completed")
    .sort((a, b) => (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt));
  const queueProjects = (project ? [project] : data?.projects ?? []).filter((candidate) =>
    project || todos.some((todo) => todo.projectId === candidate.id && !["completed", "archived"].includes(todo.status)),
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

  const setMode = (todo: Todo, mode: TodoMode) => runMutation(todo.id, async () => {
    updateTodo(await api<Todo>(`/api/todos/${todo.id}`, {
      method: "PATCH",
      body: JSON.stringify({ mode }),
    }));
  });

  const queueTodo = (todo: Todo, targetProjectId: string, beforeTodoId?: string | null) => runMutation(todo.id, async () => {
    updateTodo(await api<Todo>(`/api/todos/${todo.id}/queue`, {
      method: "PATCH",
      body: JSON.stringify({ projectId: targetProjectId, beforeTodoId: beforeTodoId ?? null }),
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
          <h1>{project?.name ?? "Todo"}</h1>
          <div className="pageActions">
            <button className="historyButton" type="button" aria-label={`已完成 ${completedTodos.length} 项`} onClick={() => setHistoryOpen(true)}>
              <History size={17} /><span>{completedTodos.length}</span>
            </button>
            <button className="primaryButton newTodoButton" type="button" onClick={() => setComposerOpen(true)}>
              <Plus size={16} />新建 Todo
            </button>
          </div>
        </div>

        {project ? (
          <ProjectSettings
            project={project}
            threads={data?.codexThreads ?? []}
            onChange={(patch) => runMutation(project.id, async () => {
              const updated = await api<Project>(`/api/projects/${project.id}`, { method: "PATCH", body: JSON.stringify(patch) });
              setData((current) => current ? { ...current, projects: current.projects.map((item) => item.id === updated.id ? updated : item) } : current);
            })}
          />
        ) : null}

        {!data ? <LoadingList /> : poolTodos.length || hasQueueTodos || project ? (
          <div className="workflowSurface">
            <QueueBoard
              projects={queueProjects}
              todos={todos}
              showProject={!projectId}
              busy={Boolean(mutatingId)}
              onQueue={queueTodo}
              onMoveToPool={moveToPool}
            />
            <TodoPool
              todos={poolTodos}
              allTodos={todos}
              projects={data.projects}
              showProject={!projectId}
              mutatingId={mutatingId}
              onMode={setMode}
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
              <button className="primaryButton emptyTodoButton" type="button" onClick={() => setComposerOpen(true)}><Plus size={15} />新建 Todo</button>
            )}
          </div>
        )}
      </section>

      {composerOpen ? (
        <TodoComposerSheet
          projects={data?.projects ?? []}
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
      {historyOpen ? <CompletionArchive todos={completedTodos} onClose={() => setHistoryOpen(false)} /> : null}
    </main>
  );
}

function TodoComposerSheet({ projects, selectedProjectId, onClose, onCreated, onError }: { projects: Project[]; selectedProjectId: string | null; onClose: () => void; onCreated: (todo: Todo) => void; onError: (value: string) => void }) {
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState(selectedProjectId ?? "");
  const [mode, setMode] = useState<TodoMode>("default");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, onClose]);

  const add = async (ready: boolean) => {
    if (!title.trim() || (ready && !projectId) || busy) return;
    setBusy(true);
    try {
      const response = await api<{ todo: Todo }>("/api/todos", {
        method: "POST",
        body: JSON.stringify({ title: title.trim(), projectId: projectId || null, mode, status: ready ? "ready" : "draft" }),
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
          <textarea autoFocus aria-label="Todo 内容" value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void add(Boolean(projectId)); }} placeholder="写下一件事…" rows={5} />
          <div className="composerProjectRow">
            <span>项目</span>
            <AppSelect
              ariaLabel="Todo 所属项目"
              value={projectId || "__inbox__"}
              onValueChange={(value) => setProjectId(value === "__inbox__" ? "" : value)}
              options={[{ value: "__inbox__", label: "Inbox" }, ...projects.map((item) => ({ value: item.id, label: item.name }))]}
              variant="row"
            />
          </div>
          <div className="composerProjectRow">
            <span>模式</span>
            <AppSelect
              ariaLabel="Todo 执行模式"
              value={mode}
              onValueChange={(value) => setMode(value as TodoMode)}
              options={TODO_MODES.map((value) => ({ value, label: TODO_MODE_META[value].label }))}
              variant="row"
            />
          </div>
        </div>
        <div className="composerActions">
          <button className="secondaryButton" type="button" disabled={busy || !title.trim()} onClick={() => void add(false)}>创建</button>
          <button className="primaryButton" type="button" disabled={busy || !title.trim() || !projectId} onClick={() => void add(true)}>
            {busy ? <LoaderCircle className="spin" size={16} /> : <Play size={15} />}创建并排队
          </button>
        </div>
        <p className="composerHint">⌘ Enter 快速提交</p>
      </section>
    </div>
  );
}

function ProjectSettings({ project, threads, onChange }: { project: Project; threads: CodexThread[]; onChange: (patch: Partial<Project>) => Promise<void> }) {
  const matchingThreads = threads.filter((thread) => pathContains(project.rootPath, thread.cwd));
  const currentThread = threads.find((thread) => thread.id === project.targetThreadId);
  const availableThreads = currentThread && !matchingThreads.some((thread) => thread.id === currentThread.id)
    ? [currentThread, ...matchingThreads]
    : matchingThreads;
  return (
    <section className="settingsGroup threadBinding" aria-label="项目对话">
      <div className="settingsTitle"><MessageSquareText size={15} /><span>项目对话</span></div>
      <div className="settingsRow">
        <span>绑定对话</span>
        <AppSelect
          ariaLabel="项目绑定的 Codex 对话"
          value={project.targetThreadId ?? "__new__"}
          onValueChange={(value) => void onChange({ targetThreadId: value === "__new__" ? null : value })}
          options={[{ value: "__new__", label: "新建对话", description: "首次执行时自动创建并绑定", kind: "create" }, ...availableThreads.map((thread) => ({ value: thread.id, label: thread.name }))]}
          variant="row"
        />
      </div>
    </section>
  );
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

function QueueBoard({ projects, todos, showProject, busy, onQueue, onMoveToPool }: { projects: Project[]; todos: Todo[]; showProject: boolean; busy: boolean; onQueue: (todo: Todo, projectId: string, beforeTodoId?: string | null) => Promise<void>; onMoveToPool: (todo: Todo) => Promise<void> }) {
  return (
    <section className="queueBoard" aria-labelledby="queueTitle">
      <header className="workflowHeader">
        <div><h2 id="queueTitle">执行队列</h2><span>拖动 Todo 插入任意一节</span></div>
      </header>
      <div className="queueLanes">
        {projects.map((project) => {
          const projectTodos = todos.filter((todo) => todo.projectId === project.id);
          const active = projectTodos.find((todo) => todo.status === "sending" || todo.status === "running") ?? null;
          const queued = projectTodos.filter((todo) => todo.status === "ready");
          return (
            <QueueLane
              key={project.id}
              project={project}
              active={active}
              queued={queued}
              allTodos={todos}
              showProject={showProject}
              busy={busy}
              onQueue={onQueue}
              onMoveToPool={onMoveToPool}
            />
          );
        })}
      </div>
    </section>
  );
}

function QueueLane({ project, active, queued, allTodos, showProject, busy, onQueue, onMoveToPool }: { project: Project; active: Todo | null; queued: Todo[]; allTodos: Todo[]; showProject: boolean; busy: boolean; onQueue: (todo: Todo, projectId: string, beforeTodoId?: string | null) => Promise<void>; onMoveToPool: (todo: Todo) => Promise<void> }) {
  const [dropBefore, setDropBefore] = useState<string | null | undefined>(undefined);
  const acceptDrop = (event: React.DragEvent, beforeTodoId: string | null) => {
    event.preventDefault();
    if (busy) return;
    const todo = allTodos.find((candidate) => candidate.id === droppedTodoId(event));
    setDropBefore(undefined);
    if (!todo || todo.id === beforeTodoId || todo.status === "sending" || todo.status === "running") return;
    void onQueue(todo, project.id, beforeTodoId);
  };
  return (
    <div className="queueLane">
      {showProject ? <div className="queueProject"><span>{project.name}</span><em>{queued.length + (active ? 1 : 0)}</em></div> : null}
      <div className="train" aria-label={`${project.name} 执行队列`}>
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
              <span className="queueTooltip" role="tooltip"><strong>{todo.title}</strong><small>{TODO_MODE_META[todo.mode].label} · 双击移出队列</small></span>
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

function TodoPool({ todos, allTodos, projects, showProject, mutatingId, onMode, onQueue, onMoveToPool }: { todos: Todo[]; allTodos: Todo[]; projects: Project[]; showProject: boolean; mutatingId: string | null; onMode: (todo: Todo, mode: TodoMode) => Promise<void>; onQueue: (todo: Todo, projectId: string, beforeTodoId?: string | null) => Promise<void>; onMoveToPool: (todo: Todo) => Promise<void> }) {
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
            const busy = mutatingId === todo.id;
            return (
              <article className={`poolTodo${todo.status === "failed" ? " failed" : ""}`} key={todo.id} draggable={!busy} onDragStart={(event) => dragTodo(event, todo)}>
                <GripVertical className="poolGrip" size={16} />
                <div className="poolCopy">
                  <h3>{todo.title}</h3>
                  {todo.description ? <p>{todo.description}</p> : null}
                  {todo.lastError ? <p className="todoError">{todo.lastError}</p> : null}
                  {showProject ? <span className="projectName">{project?.name ?? "未分项目"}</span> : null}
                </div>
                <div className="poolActions">
                  <AppSelect
                    ariaLabel={`${todo.title} 执行模式`}
                    value={todo.mode}
                    disabled={busy}
                    onValueChange={(value) => void onMode(todo, value as TodoMode)}
                    options={TODO_MODES.map((value) => ({ value, label: TODO_MODE_META[value].label }))}
                    variant="mode"
                  />
                  <button className="queueTodoButton" type="button" disabled={busy || !project} aria-label={`将 ${todo.title} 加入队列`} onClick={() => { if (project) void onQueue(todo, project.id); }}>
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, TodoResult>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const toggle = async (todo: Todo) => {
    if (expandedId === todo.id) { setExpandedId(null); return; }
    setExpandedId(todo.id);
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

  return (
    <div className="sheetBackdrop composerBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="historySheet" role="dialog" aria-modal="true" aria-labelledby="historyTitle">
        <div className="sheetHandle" />
        <header className="historyHeader"><button className="sheetTextButton" type="button" onClick={onClose}>关闭</button><h2 id="historyTitle">已完成</h2><span>{todos.length}</span></header>
        {error ? <div className="historyError" role="alert">{error}</div> : null}
        {todos.length ? (
          <div className="historyList">
            {todos.map((todo) => {
              const expanded = expandedId === todo.id;
              const result = results[todo.id];
              return (
                <article className={`historyItem${expanded ? " expanded" : ""}`} key={todo.id}>
                  <button className="historyItemTrigger" type="button" aria-expanded={expanded} onClick={() => void toggle(todo)}>
                    <CheckCircle2 size={17} /><span><strong>{todo.title}</strong><small>{todo.completedAt ? new Date(todo.completedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "已完成"}</small></span><ChevronDown size={15} />
                  </button>
                  {expanded ? (
                    <div className="historyResult">
                      {loadingId === todo.id ? <div className="historyLoading"><LoaderCircle className="spin" size={16} />读取结果</div> : result ? (
                        <>
                          <div className="markdownBody compact" dangerouslySetInnerHTML={{ __html: result.answerHtml }} />
                          {result.artifacts.length ? <ul className="historyArtifacts">{result.artifacts.map((artifact) => <li key={artifact.uri}><strong>{artifact.name}</strong><code>{artifact.uri}</code></li>)}</ul> : null}
                          <Link className="historyOpenLink" href={`/completion/${todo.id}`}>单独打开</Link>
                        </>
                      ) : <p>这次执行没有可读取的结果。</p>}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : <div className="historyEmpty"><CheckCircle2 size={22} /><span>还没有完成记录</span></div>}
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
        <p className="sheetIntro">选择共享项目，并绑定一个 Codex 对话。</p>
        <div className="formGroup">
          <div className="formRow"><span>共享项目</span><AppSelect ariaLabel="共享项目" value={rootPath || "__none__"} onValueChange={(value) => { setRootPath(value === "__none__" ? "" : value); setThreadId(""); }} options={[{ value: "__none__", label: "选择共享项目" }, ...(data?.codexProjects.map((item) => ({ value: item.rootPath, label: item.name })) ?? [])]} variant="row" /></div>
          <div className="formRow"><span>绑定对话</span><AppSelect ariaLabel="绑定 Codex 对话" value={threadId || "__new__"} disabled={!sharedProject} onValueChange={(value) => setThreadId(value === "__new__" ? "" : value)} options={[{ value: "__new__", label: "新建对话", description: "首次执行时自动创建并绑定", kind: "create" }, ...projectThreads.map((thread) => ({ value: thread.id, label: thread.name }))]} variant="row" /></div>
        </div>
      </section>
    </div>
  );
}

type AppSelectOption = { value: string; label: string; description?: string; kind?: "create" };

function AppSelect({ ariaLabel, value, options, variant, disabled, onValueChange }: { ariaLabel: string; value: string; options: AppSelectOption[]; variant: "compact" | "row" | "mode" | "status"; disabled?: boolean; onValueChange: (value: string) => void }) {
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
