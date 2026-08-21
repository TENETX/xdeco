"use client";

import { Archive, Boxes, Check, ChevronDown, Clock3, FolderGit2, Inbox, LoaderCircle, Play, Plus, RefreshCw, RotateCcw, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { STATUS_META, TODO_STATUSES, type CodexThread, type Overview, type Project, type Todo, type TodoStatus } from "@whomi/shared";

const VISIBLE_STATUSES = TODO_STATUSES.filter((status) => status !== "archived");

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { "content-type": "application/json", ...init?.headers }, cache: "no-store" });
  const body = await response.json(); if (!response.ok) throw new Error(body.error ?? `请求失败 (${response.status})`); return body as T;
}

export function Dashboard() {
  const [data, setData] = useState<Overview | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => { try { setData(await api("/api/overview")); } catch (reason) { setError(String(reason)); } }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const project = data?.projects.find((item) => item.id === projectId) ?? null;
  const todos = useMemo(() => (data?.todos ?? []).filter((todo) => {
    if (projectId && todo.projectId !== projectId) return false;
    return !query.trim() || `${todo.title} ${todo.description}`.toLowerCase().includes(query.trim().toLowerCase());
  }), [data, projectId, query]);
  const mutate = async (work: () => Promise<unknown>) => { try { setError(""); await work(); await refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } };
  const setStatus = (todo: Todo, status: TodoStatus) => mutate(() => api(`/api/todos/${todo.id}/status`, { method: "PATCH", body: JSON.stringify({ status, projectId: todo.projectId }) }));

  return <main className="appShell">
    <header className="topbar">
      <div className="brandMark"><Boxes size={18} /></div><div className="brandText"><strong>whomi</strong></div><div className="topbarDivider" />
      <div className="contextTitle"><strong>{project?.name ?? "全部 Todo"}</strong></div>
      <label className="searchBox"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索 Todo" /></label>
      <button className="iconButton" onClick={() => void refresh()}><RefreshCw size={17} /></button>
      <div className={`healthPill ${data?.controller.codexAvailable ? "online" : "offline"}`}><span />{data?.controller.codexAvailable ? "已连接" : "暂不可用"}</div>
    </header>
    <aside className="sidebar">
      <nav className="sidebarNav"><button className={!projectId ? "navItem active" : "navItem"} onClick={() => setProjectId(null)}><Inbox size={17} /><span>全部 Todo</span><em>{data?.todos.filter((todo) => todo.status !== "archived").length ?? 0}</em></button></nav>
      <div className="sidebarHeading"><span>项目</span><button onClick={() => setSheetOpen(true)}><Plus size={16} /></button></div>
      <div className="planList">{data?.projects.map((item) => <button key={item.id} className={projectId === item.id ? "planItem active" : "planItem"} onClick={() => setProjectId(item.id)}><span className="planColor" style={{ background: item.color }} /><span className="planCopy"><strong>{item.name}</strong><small>{item.autoDispatch ? "自动串行发送" : "手动发送"}</small></span><em>{data.todos.filter((todo) => todo.projectId === item.id && todo.status === "ready").length}</em></button>)}</div>
    </aside>
    <section className="workspace">
      {error ? <div className="errorBanner"><span>{error}</span><button onClick={() => setError("")}><X size={15} /></button></div> : null}
      <QuickAdd projects={data?.projects ?? []} selectedProjectId={projectId} onDone={refresh} onError={setError} />
      <div className="workspaceToolbar"><div><p className="eyebrow">{project ? "当前项目" : "工作台"}</p><h1>{project?.name ?? "Todo 队列"}</h1></div><div className="toolbarActions"><button className={showArchived ? "archiveToggle active" : "archiveToggle"} onClick={() => setShowArchived(!showArchived)}><Archive size={16} />归档</button><button className="primaryButton" onClick={() => setSheetOpen(true)}><Plus size={16} />新建项目</button></div></div>
      {project ? <ProjectBar project={project} threads={data?.codexThreads ?? []} ready={todos.filter((todo) => todo.status === "ready").length} onChange={(patch) => mutate(() => api(`/api/projects/${project.id}`, { method: "PATCH", body: JSON.stringify(patch) }))} onDispatch={() => mutate(() => api(`/api/projects/${project.id}/dispatch`, { method: "POST", body: "{}" }))} /> : null}
      <div className="board">{VISIBLE_STATUSES.map((status) => <StatusColumn key={status} status={status} todos={todos.filter((todo) => todo.status === status)} projects={data?.projects ?? []} onStatus={setStatus} onRetry={(todo) => mutate(() => api(`/api/todos/${todo.id}/retry`, { method: "POST", body: "{}" }))} />)}{showArchived ? <StatusColumn status="archived" todos={todos.filter((todo) => todo.status === "archived")} projects={data?.projects ?? []} onStatus={setStatus} onRetry={() => Promise.resolve()} /> : null}</div>
    </section>
    {sheetOpen ? <ProjectSheet data={data} onClose={() => setSheetOpen(false)} onCreated={async (created) => { await refresh(); setProjectId(created.id); setSheetOpen(false); }} onError={setError} /> : null}
  </main>;
}

function QuickAdd({ projects, selectedProjectId, onDone, onError }: { projects: Project[]; selectedProjectId: string | null; onDone: () => Promise<void>; onError: (value: string) => void }) {
  const [title, setTitle] = useState(""); const [projectId, setProjectId] = useState(selectedProjectId ?? ""); const [busy, setBusy] = useState(false);
  useEffect(() => setProjectId(selectedProjectId ?? ""), [selectedProjectId]);
  const add = async (ready: boolean) => { if (!title.trim() || (ready && !projectId)) return; setBusy(true); try { const response = await api<{ todo: Todo }>("/api/todos", { method: "POST", body: JSON.stringify({ title: title.trim(), projectId: projectId || null, status: ready ? "ready" : "draft" }) }); if (response.todo) setTitle(""); await onDone(); } catch (reason) { onError(String(reason)); } finally { setBusy(false); } };
  return <section className="captureBox"><div className="captureMain"><textarea value={title} onChange={(event) => setTitle(event.target.value)} placeholder="写下一件事…" rows={2} /><div className="captureMeta"><label className="planSelect"><FolderGit2 size={15} /><select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Inbox</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown size={14} /></label><span className="captureHint">待发送会按顺序逐条投递</span></div></div><div className="captureActions"><button className="captureQueue" disabled={busy || !title.trim()} onClick={() => void add(false)}><Plus size={17} />存草稿</button><button className="captureSubmit" disabled={busy || !title.trim() || !projectId} onClick={() => void add(true)}>{busy ? <LoaderCircle className="spin" size={17} /> : <Play size={17} />}加入队列</button></div></section>;
}

function ProjectBar({ project, threads, ready, onChange, onDispatch }: { project: Project; threads: CodexThread[]; ready: number; onChange: (patch: Partial<Project>) => Promise<void>; onDispatch: () => Promise<void> }) {
  return <div className="bindingBar"><div><FolderGit2 size={16} /><span>{project.rootPath}</span></div><span className="bindingCount">{ready} 项待发送</span><label className="bindingRoute"><span>发送到</span><select value={project.targetThreadId ?? ""} onChange={(event) => void onChange({ targetThreadId: event.target.value || null })}><option value="">首次发送时新建任务</option>{threads.map((thread) => <option key={thread.id} value={thread.id}>{thread.name}</option>)}</select></label><label><input type="checkbox" checked={project.autoDispatch} onChange={(event) => void onChange({ autoDispatch: event.target.checked })} /> 自动发送</label><button className="primaryButton" onClick={() => void onDispatch()}><Play size={14} />开始队列</button></div>;
}

function StatusColumn({ status, todos, projects, onStatus, onRetry }: { status: TodoStatus; todos: Todo[]; projects: Project[]; onStatus: (todo: Todo, status: TodoStatus) => Promise<void>; onRetry: (todo: Todo) => Promise<void> }) {
  const meta = STATUS_META[status];
  return <section className={`statusColumn tone-${meta.tone}`}><header className="columnHeader"><span className="statusDot" /><strong>{meta.label}</strong><em>{todos.length}</em></header><p className="columnDescription">{meta.description}</p><div className="cardStack">{todos.map((todo) => <article className="todoCard" key={todo.id}><div className="cardTopline"><span className="miniPlan">{projects.find((item) => item.id === todo.projectId)?.name ?? "Inbox"}</span><label className="statusSelect"><select value={todo.status} disabled={["sending", "running"].includes(todo.status)} onChange={(event) => void onStatus(todo, event.target.value as TodoStatus)}>{TODO_STATUSES.filter((item) => !["sending", "running"].includes(item) || item === todo.status).map((item) => <option key={item} value={item}>{STATUS_META[item].label}</option>)}</select><ChevronDown size={13} /></label></div><h3>{todo.title}</h3>{todo.description ? <p>{todo.description}</p> : null}{todo.lastError ? <p>{todo.lastError}</p> : null}<div className="cardFooter"><span><Clock3 size={13} />{todo.status}</span>{todo.status === "failed" ? <button className="runButton" onClick={() => void onRetry(todo)}><RotateCcw size={14} />重试</button> : null}{todo.status === "running" ? <span><LoaderCircle className="spin" size={14} />处理中</span> : null}{todo.status === "completed" ? <span><Check size={14} />完成</span> : null}</div></article>)}{!todos.length ? <div className="columnEmpty"><p>暂无 Todo</p></div> : null}</div></section>;
}

function ProjectSheet({ data, onClose, onCreated, onError }: { data: Overview | null; onClose: () => void; onCreated: (project: Project) => Promise<void>; onError: (value: string) => void }) {
  const first = data?.codexProjects[0]; const [name, setName] = useState(first?.name ?? ""); const [rootPath, setRootPath] = useState(first?.rootPath ?? ""); const [threadId, setThreadId] = useState("");
  const submit = async () => { try { await onCreated(await api<Project>("/api/projects", { method: "POST", body: JSON.stringify({ name, rootPath, targetThreadId: threadId || null, autoDispatch: true }) })); } catch (reason) { onError(String(reason)); } };
  return <div className="sheetBackdrop"><aside className="planSheet"><header><h2>新建项目</h2><button className="iconButton" onClick={onClose}><X size={18} /></button></header><p className="sheetIntro">项目只负责组织 Todo，并指定发送到哪个 Codex 任务。</p><div className="formGrid"><label><span>名称</span><input value={name} onChange={(event) => setName(event.target.value)} /></label><label className="wide"><span>本地项目</span><select value={rootPath} onChange={(event) => { const root = event.target.value; setRootPath(root); setName(data?.codexProjects.find((item) => item.rootPath === root)?.name ?? name); }}>{data?.codexProjects.map((item) => <option key={item.rootPath} value={item.rootPath}>{item.name}</option>)}</select></label><label className="wide"><span>发送到</span><select value={threadId} onChange={(event) => setThreadId(event.target.value)}><option value="">首次发送时新建任务</option>{data?.codexThreads.map((thread) => <option key={thread.id} value={thread.id}>{thread.name}</option>)}</select></label></div><footer><button className="secondaryButton" onClick={onClose}>取消</button><button className="primaryButton" disabled={!name.trim() || !rootPath.trim()} onClick={() => void submit()}><Plus size={16} />创建项目</button></footer></aside></div>;
}
