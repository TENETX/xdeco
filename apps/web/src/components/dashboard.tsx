"use client";

import Link from "next/link";
import {
  Archive,
  Boxes,
  Check,
  CircleAlert,
  Clock3,
  Inbox,
  LoaderCircle,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  STATUS_META,
  TODO_STATUSES,
  type CodexThread,
  type Overview,
  type Project,
  type Todo,
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

const TODO_GROUPS: Array<{ key: string; label: string; statuses: TodoStatus[] }> = [
  { key: "active", label: "正在进行", statuses: ["sending", "running"] },
  { key: "queued", label: "接下来", statuses: ["ready"] },
  { key: "draft", label: "稍后处理", statuses: ["draft"] },
  { key: "failed", label: "需要处理", statuses: ["failed"] },
  { key: "completed", label: "最近完成", statuses: ["completed"] },
  { key: "archived", label: "已归档", statuses: ["archived"] },
];

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
  const [showArchived, setShowArchived] = useState(false);
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
      if (!showArchived && todo.status === "archived") return false;
      return !normalized || `${todo.title} ${todo.description}`.toLocaleLowerCase().includes(normalized);
    });
  }, [data, projectId, query, showArchived]);

  const groups = TODO_GROUPS
    .filter((group) => showArchived || group.key !== "archived")
    .map((group) => ({ ...group, todos: todos.filter((todo) => group.statuses.includes(todo.status)) }))
    .filter((group) => group.todos.length > 0);

  const updateTodo = useCallback((updated: Todo) => {
    setData((current) => current
      ? { ...current, todos: current.todos.map((todo) => todo.id === updated.id ? updated : todo) }
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

  const retry = (todo: Todo) => runMutation(todo.id, async () => {
    updateTodo(await api<Todo>(`/api/todos/${todo.id}/retry`, { method: "POST", body: "{}" }));
  });

  const activeProjectCount = (id: string | null) => (data?.todos ?? []).filter(
    (todo) => todo.projectId === id && todo.status !== "archived",
  ).length;

  return (
    <main className="iosShell">
      <header className="iosNav">
        <div className="navPrimary">
          <div className="appIdentity">
            <span className="appIcon"><Boxes size={18} /></span>
            <strong>xdeco</strong>
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
          <div>
            <h1>{project?.name ?? "Todo"}</h1>
            <p>{project ? "发送到这个项目关联的 Codex task" : "集中查看所有项目的执行状态"}</p>
          </div>
          <button className={showArchived ? "textButton active" : "textButton"} type="button" onClick={() => setShowArchived((value) => !value)}>
            <Archive size={16} />{showArchived ? "隐藏归档" : "显示归档"}
          </button>
        </div>

        <QuickAdd projects={data?.projects ?? []} selectedProjectId={projectId} onCreated={(todo) => { updateTodo(todo); void refresh(true); }} onError={setError} />

        {project ? (
          <ProjectSettings
            project={project}
            threads={data?.codexThreads ?? []}
            busy={mutatingId === project.id}
            onChange={(patch) => runMutation(project.id, async () => {
              const updated = await api<Project>(`/api/projects/${project.id}`, { method: "PATCH", body: JSON.stringify(patch) });
              setData((current) => current ? { ...current, projects: current.projects.map((item) => item.id === updated.id ? updated : item) } : current);
            })}
            onDispatch={() => runMutation(project.id, async () => { await api(`/api/projects/${project.id}/dispatch`, { method: "POST", body: "{}" }); })}
          />
        ) : null}

        {!data ? <LoadingList /> : groups.length ? (
          <div className="todoGroups">
            {groups.map((group) => (
              <TodoGroup
                key={group.key}
                label={group.label}
                todos={group.todos}
                projects={data.projects}
                showProject={!projectId}
                mutatingId={mutatingId}
                onStatus={setStatus}
                onRetry={retry}
              />
            ))}
          </div>
        ) : (
          <div className="iosEmpty">
            <span><Check size={22} /></span>
            <h2>{query ? "没有匹配的 Todo" : "这里已经清空"}</h2>
            <p>{query ? "换个关键词试试。" : "从上方写下一件事，或切换到其他项目。"}</p>
          </div>
        )}
      </section>

      {sheetOpen ? <ProjectSheet data={data} onClose={() => setSheetOpen(false)} onCreated={async (created) => { await refresh(true); setProjectId(created.id); setSheetOpen(false); }} onError={setError} /> : null}
    </main>
  );
}

function QuickAdd({ projects, selectedProjectId, onCreated, onError }: { projects: Project[]; selectedProjectId: string | null; onCreated: (todo: Todo) => void; onError: (value: string) => void }) {
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState(selectedProjectId ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => setProjectId(selectedProjectId ?? ""), [selectedProjectId]);

  const add = async (ready: boolean) => {
    if (!title.trim() || (ready && !projectId) || busy) return;
    setBusy(true);
    try {
      const response = await api<{ todo: Todo }>("/api/todos", {
        method: "POST",
        body: JSON.stringify({ title: title.trim(), projectId: projectId || null, status: ready ? "ready" : "draft" }),
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
    <section className="quickAdd">
      <textarea value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void add(Boolean(projectId)); }} placeholder="写下一件要交给 Codex 的事…" rows={2} />
      <div className="quickAddFooter">
        <div className="projectPicker">
          <AppSelect
            ariaLabel="Todo 所属项目"
            value={projectId || "__inbox__"}
            onValueChange={(value) => setProjectId(value === "__inbox__" ? "" : value)}
            options={[{ value: "__inbox__", label: "Inbox" }, ...projects.map((item) => ({ value: item.id, label: item.name }))]}
            variant="compact"
          />
        </div>
        <span className="keyboardHint">⌘ Enter 快速提交</span>
        <div className="quickActions">
          <button className="secondaryButton" disabled={busy || !title.trim()} onClick={() => void add(false)}>存草稿</button>
          <button className="primaryButton" disabled={busy || !title.trim() || !projectId} onClick={() => void add(true)}>
            {busy ? <LoaderCircle className="spin" size={16} /> : <Play size={15} />}加入队列
          </button>
        </div>
      </div>
    </section>
  );
}

function ProjectSettings({ project, threads, busy, onChange, onDispatch }: { project: Project; threads: CodexThread[]; busy: boolean; onChange: (patch: Partial<Project>) => Promise<void>; onDispatch: () => Promise<void> }) {
  return (
    <section className="settingsGroup" aria-label="项目设置">
      <div className="settingsTitle"><Settings2 size={15} /><span>项目设置</span></div>
      <div className="settingsRow">
        <span>发送到</span>
        <AppSelect
          ariaLabel="发送到 Codex task"
          value={project.targetThreadId ?? "__new__"}
          onValueChange={(value) => void onChange({ targetThreadId: value === "__new__" ? null : value })}
          options={[{ value: "__new__", label: "新建 task", description: "首次发送时自动创建", kind: "create" }, ...threads.map((thread) => ({ value: thread.id, label: thread.name }))]}
          variant="row"
        />
      </div>
      <div className="settingsRow">
        <span>自动发送</span>
        <button className={project.autoDispatch ? "iosSwitch on" : "iosSwitch"} type="button" role="switch" aria-checked={project.autoDispatch} onClick={() => void onChange({ autoDispatch: !project.autoDispatch })}><i /></button>
      </div>
      <div className="settingsRow queueAction">
        <span>立即处理队列</span>
        <button className="plainAction" type="button" disabled={busy} onClick={() => void onDispatch()}>{busy ? <LoaderCircle className="spin" size={15} /> : <Play size={14} />}开始</button>
      </div>
    </section>
  );
}

function TodoGroup({ label, todos, projects, showProject, mutatingId, onStatus, onRetry }: { label: string; todos: Todo[]; projects: Project[]; showProject: boolean; mutatingId: string | null; onStatus: (todo: Todo, status: TodoStatus) => Promise<void>; onRetry: (todo: Todo) => Promise<void> }) {
  return (
    <section className="todoGroup">
      <header><h2>{label}</h2><span>{todos.length}</span></header>
      <div className="groupedList">
        {todos.map((todo) => (
          <TodoRow key={todo.id} todo={todo} project={projects.find((item) => item.id === todo.projectId) ?? null} showProject={showProject} busy={mutatingId === todo.id} onStatus={onStatus} onRetry={onRetry} />
        ))}
      </div>
    </section>
  );
}

function TodoRow({ todo, project, showProject, busy, onStatus, onRetry }: { todo: Todo; project: Project | null; showProject: boolean; busy: boolean; onStatus: (todo: Todo, status: TodoStatus) => Promise<void>; onRetry: (todo: Todo) => Promise<void> }) {
  const locked = todo.status === "sending" || todo.status === "running";
  return (
    <article className="todoRow">
      <span className={`rowStatus tone-${STATUS_META[todo.status].tone}`}>{todo.status === "running" || todo.status === "sending" ? <LoaderCircle className="spin" size={15} /> : todo.status === "completed" ? <Check size={15} /> : todo.status === "failed" ? <CircleAlert size={15} /> : <Clock3 size={14} />}</span>
      <div className="todoCopy">
        <h3>{todo.title}</h3>
        {todo.description ? <p>{todo.description}</p> : null}
        {todo.lastError ? <p className="todoError">{todo.lastError}</p> : null}
        {showProject ? <span className="projectName">{project?.name ?? "Inbox"}</span> : null}
      </div>
      <div className="todoControls">
        {todo.status === "completed" && todo.completionThreadId ? <Link className="resultLink" href={`/completion/${todo.id}`}>查看结果</Link> : null}
        {todo.status === "failed" ? <button className="resultLink" disabled={busy} onClick={() => void onRetry(todo)}><RotateCcw size={13} />重试</button> : null}
        <div className="statusPicker">
          <AppSelect
            ariaLabel={`${todo.title} 状态`}
            value={todo.status}
            disabled={locked || busy}
            onValueChange={(value) => void onStatus(todo, value as TodoStatus)}
            options={TODO_STATUSES.filter((status) => !["sending", "running"].includes(status) || status === todo.status).map((status) => ({ value: status, label: STATUS_META[status].label }))}
            variant="status"
          />
        </div>
      </div>
    </article>
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
        <p className="sheetIntro">选择 Codex Agent 已同步的项目，再关联它下面的 task。</p>
        <div className="formGroup">
          <div className="formRow"><span>共享项目</span><AppSelect ariaLabel="共享项目" value={rootPath || "__none__"} onValueChange={(value) => { setRootPath(value === "__none__" ? "" : value); setThreadId(""); }} options={[{ value: "__none__", label: "选择共享项目" }, ...(data?.codexProjects.map((item) => ({ value: item.rootPath, label: item.name })) ?? [])]} variant="row" /></div>
          <div className="formRow"><span>关联 task</span><AppSelect ariaLabel="关联 Codex task" value={threadId || "__new__"} disabled={!sharedProject} onValueChange={(value) => setThreadId(value === "__new__" ? "" : value)} options={[{ value: "__new__", label: "新建 task", description: "首次发送时自动创建", kind: "create" }, ...projectThreads.map((thread) => ({ value: thread.id, label: thread.name }))]} variant="row" /></div>
        </div>
      </section>
    </div>
  );
}

type AppSelectOption = { value: string; label: string; description?: string; kind?: "create" };

function AppSelect({ ariaLabel, value, options, variant, disabled, onValueChange }: { ariaLabel: string; value: string; options: AppSelectOption[]; variant: "compact" | "row" | "status"; disabled?: boolean; onValueChange: (value: string) => void }) {
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
