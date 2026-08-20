"use client";

import Link from "next/link";
import {
  Archive,
  ArrowUpRight,
  Boxes,
  Check,
  ChevronDown,
  CircleDot,
  Clock3,
  FolderGit2,
  ImagePlus,
  Inbox,
  LoaderCircle,
  MoreHorizontal,
  Play,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  STATUS_META,
  TODO_STATUSES,
  type CodexProject,
  type CodexThread,
  type CreatePlanInput,
  type Overview,
  type Plan,
  type Todo,
  type TodoStatus,
} from "@whomi/shared";

const ACTIVE_STATUSES = TODO_STATUSES.filter((status) => status !== "ended");

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? `请求失败 (${response.status})`);
  return body as T;
}

function friendlyError(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (/invalid mcp tool call params/i.test(message)) return "提交内容不完整，请刷新后再试";
  if (/Completion requires/i.test(message)) return "请先开始这项 Todo，再标记完成";
  if (/Plan not found/i.test(message)) return "这个 Plan 已不存在，请刷新后重试";
  if (/thread.*not found|rollout.*not found/i.test(message)) return "找不到这个 Codex 任务，请重新选择";
  if (/required/i.test(message)) return "请把必填内容补完整";
  return message;
}

function timeAgo(value: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

export function Dashboard() {
  const [data, setData] = useState<Overview | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showEnded, setShowEnded] = useState(false);
  const [planSheetOpen, setPlanSheetOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      setData(await api<Overview>("/api/overview"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const selectedPlan = data?.plans.find((plan) => plan.id === selectedPlanId) ?? null;
  const visibleTodos = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data?.todos ?? []).filter((todo) => {
      if (selectedPlanId && todo.planId !== selectedPlanId) return false;
      if (needle && !`${todo.title} ${todo.description}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [data, selectedPlanId, query]);

  const mutate = async (action: () => Promise<unknown>) => {
    try {
      setError("");
      await action();
      await refresh();
    } catch (reason) {
      setError(friendlyError(reason));
    }
  };

  const setStatus = (todo: Todo, status: TodoStatus) => mutate(async () => {
    if (status === "completed") {
      await api(`/api/todos/${todo.id}/complete`, { method: "POST", body: JSON.stringify({ summary: "" }) });
    } else {
      await api(`/api/todos/${todo.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status, planId: todo.planId }),
      });
    }
  });

  return (
    <main className="appShell">
      <header className="topbar">
        <div className="brandMark"><Boxes size={18} strokeWidth={2.2} /></div>
        <div className="brandText"><strong>whomi</strong></div>
        <div className="topbarDivider" />
        <div className="contextTitle">
          <span>{selectedPlan ? selectedPlan.projectName : "全部 Todo"}</span>
          {selectedPlan ? <><span className="contextSlash">/</span><strong>{selectedPlan.name}</strong></> : null}
        </div>
        <label className="searchBox">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索 Todo" />
          <kbd>⌘ K</kbd>
        </label>
        <button className="iconButton" aria-label="刷新" onClick={() => void refresh()}><RefreshCw size={17} /></button>
        <div className={`healthPill ${data?.controller.codexAvailable ? "online" : "offline"}`}>
          <span /> {data?.controller.codexAvailable ? "已连接" : "暂不可用"}
        </div>
      </header>

      <aside className="sidebar">
        <nav className="sidebarNav">
          <button className={!selectedPlanId ? "navItem active" : "navItem"} onClick={() => setSelectedPlanId(null)}>
            <Inbox size={17} />
            <span>全部 Todo</span>
            <em>{data?.todos.filter((todo) => todo.status !== "ended").length ?? 0}</em>
          </button>
        </nav>
        <div className="sidebarHeading"><span>PLANS</span><button aria-label="新建 Plan" onClick={() => setPlanSheetOpen(true)}><Plus size={16} /></button></div>
        <div className="planList">
          {data?.plans.map((plan) => {
            const count = data.todos.filter((todo) => todo.planId === plan.id && todo.status !== "ended").length;
            return (
              <button key={plan.id} className={selectedPlanId === plan.id ? "planItem active" : "planItem"} onClick={() => setSelectedPlanId(plan.id)}>
                <span className="planColor" style={{ background: plan.color }} />
                <span className="planCopy"><strong>{plan.name}</strong><small>{plan.projectName}</small></span>
                <em>{count}</em>
              </button>
            );
          })}
          {!data?.plans.length && !loading ? (
            <button className="emptyPlan" onClick={() => setPlanSheetOpen(true)}>
              <FolderGit2 size={21} />
              <span><strong>创建第一个 Plan</strong><small>选择项目后即可创建</small></span>
            </button>
          ) : null}
        </div>
        <div className="sidebarFooter">
          <div className="controllerAvatar"><Sparkles size={17} /></div>
          <div><strong>智能整理</strong><small>把一段内容拆成 Todo</small></div>
        </div>
      </aside>

      <section className="workspace">
        {error ? <div className="errorBanner"><CircleDot size={16} /><span>{error}</span><button onClick={() => setError("")}><X size={15} /></button></div> : null}
        <QuickCapture plans={data?.plans ?? []} selectedPlanId={selectedPlanId} onCreated={refresh} onError={setError} />

        <div className="workspaceToolbar">
          <div>
            <p className="eyebrow">{selectedPlan ? "当前 Plan" : "全部 Todo"}</p>
            <h1>{selectedPlan?.name ?? "任务控制台"}</h1>
          </div>
          <div className="toolbarActions">
            <button className={showEnded ? "archiveToggle active" : "archiveToggle"} onClick={() => setShowEnded((value) => !value)}>
              <Archive size={16} /> 结束箱 <span>{visibleTodos.filter((todo) => todo.status === "ended").length}</span>
            </button>
            <button className="primaryButton" onClick={() => setPlanSheetOpen(true)}><Plus size={16} /> 新建 Plan</button>
          </div>
        </div>

        {selectedPlan ? <PlanBinding
          plan={selectedPlan}
          queued={visibleTodos.filter((todo) => todo.status === "queued").length}
          threads={data?.codexThreads ?? []}
          onRoute={(threadId) => mutate(() => api(`/api/plans/${selectedPlan.id}`, {
            method: "PATCH",
            body: JSON.stringify({ threadId: threadId || null }),
          }))}
        /> : null}

        <div className="board" aria-busy={loading}>
          {loading ? <BoardSkeleton /> : ACTIVE_STATUSES.map((status) => (
            <StatusColumn
              key={status}
              status={status}
              todos={visibleTodos.filter((todo) => todo.status === status)}
              plans={data?.plans ?? []}
              onStatus={setStatus}
              onLaunch={(todo) => mutate(() => api(`/api/todos/${todo.id}/launch`, { method: "POST", body: "{}" }))}
            />
          ))}
          {showEnded ? (
            <StatusColumn
              status="ended"
              todos={visibleTodos.filter((todo) => todo.status === "ended")}
              plans={data?.plans ?? []}
              onStatus={setStatus}
              onLaunch={() => Promise.resolve()}
            />
          ) : null}
        </div>
      </section>

      {planSheetOpen ? <PlanSheet projects={data?.codexProjects ?? []} threads={data?.codexThreads ?? []} onClose={() => setPlanSheetOpen(false)} onCreated={async (plan) => { await refresh(); setSelectedPlanId(plan.id); setPlanSheetOpen(false); }} onError={setError} /> : null}
    </main>
  );
}

function QuickCapture({ plans, selectedPlanId, onCreated, onError }: {
  plans: Plan[];
  selectedPlanId: string | null;
  onCreated: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [text, setText] = useState("");
  const [planId, setPlanId] = useState(selectedPlanId ?? "");
  const [image, setImage] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState<"add" | "send" | "organize" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setPlanId(selectedPlanId ?? ""); }, [selectedPlanId]);

  const add = async (sendToCodex = false) => {
    const title = text.trim();
    if (!title || image || (sendToCodex && !planId)) return;
    setSubmitting(sendToCodex ? "send" : "add");
    onError("");
    let created = false;
    try {
      const todo = await api<Todo>("/api/todos", {
        method: "POST",
        body: JSON.stringify({
          title,
          status: planId ? "queued" : "someday",
          ...(planId ? { planId } : {}),
          sourceType: "text",
        }),
      });
      created = true;
      if (sendToCodex) {
        await api(`/api/todos/${todo.id}/launch`, { method: "POST", body: "{}" });
      }
      setText("");
      await onCreated();
    } catch (reason) {
      if (created) {
        setText("");
        await onCreated().catch(() => undefined);
      }
      onError(friendlyError(reason));
    } finally {
      setSubmitting(null);
    }
  };

  const organize = async () => {
    if (!text.trim() && !image) return;
    setSubmitting("organize");
    onError("");
    try {
      let imagePayload: { name: string; dataBase64: string } | null = null;
      if (image) {
        const bytes = new Uint8Array(await image.arrayBuffer());
        let binary = "";
        for (const byte of bytes) binary += String.fromCharCode(byte);
        imagePayload = { name: image.name, dataBase64: btoa(binary) };
      }
      const result = await api<{ warning?: string }>("/api/capture", {
        method: "POST",
        body: JSON.stringify({ text, planId: planId || null, image: imagePayload }),
      });
      setText("");
      setImage(null);
      await onCreated();
      if (result.warning) onError(result.warning);
    } catch (reason) {
      onError(friendlyError(reason));
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <section className="captureBox">
      <div className="captureIcon"><Sparkles size={19} /></div>
      <div className="captureMain">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void (image ? organize() : add(false)); }}
          placeholder="写下一件事…"
          rows={2}
        />
        <div className="captureMeta">
          <button className={image ? "attachmentButton active" : "attachmentButton"} onClick={() => fileRef.current?.click()}>
            <ImagePlus size={16} /> {image ? image.name : "截图"}
          </button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => setImage(event.target.files?.[0] ?? null)} />
          <label className="planSelect"><FolderGit2 size={15} /><select value={planId} onChange={(event) => setPlanId(event.target.value)}><option value="">不分配 Plan</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select><ChevronDown size={14} /></label>
          <span className="captureHint">{planId ? "添加会先记下；发送会立即开始" : "选择 Plan 后可以发给 Codex"}</span>
        </div>
      </div>
      <div className="captureActions">
        <button className="captureOrganize" disabled={Boolean(submitting) || (!text.trim() && !image)} onClick={() => void organize()}>
          {submitting === "organize" ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />} 整理
        </button>
        <button className="captureQueue" disabled={Boolean(submitting) || !text.trim() || Boolean(image)} onClick={() => void add(false)} title={image ? "附有截图时请使用整理" : undefined}>
          {submitting === "add" ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />}
          {submitting === "add" ? "添加中" : "添加"}
        </button>
        <button className="captureSubmit" disabled={Boolean(submitting) || !text.trim() || Boolean(image) || !planId} onClick={() => void add(true)} title={!planId ? "先选择一个 Plan" : image ? "附有截图时请使用整理" : "添加后立即发给这个 Plan 选择的 Codex 任务"}>
          {submitting === "send" ? <LoaderCircle className="spin" size={17} /> : <Play size={17} fill="currentColor" />}
          {submitting === "send" ? "发送中" : "发给 Codex"}
        </button>
      </div>
    </section>
  );
}

function PlanBinding({ plan, queued, threads, onRoute }: { plan: Plan; queued: number; threads: CodexThread[]; onRoute: (threadId: string) => Promise<void> }) {
  const matching = threads.filter((thread) => thread.cwd === plan.projectRoot);
  const selected = plan.threadId ? threads.find((thread) => thread.id === plan.threadId) : null;
  if (selected && !matching.some((thread) => thread.id === selected.id)) matching.unshift(selected);
  return (
    <div className="bindingBar">
      <div><FolderGit2 size={16} /><span>{plan.projectName}</span></div>
      <strong>{plan.name}</strong>
      <span className="bindingCount">{queued} 项待开始</span>
      <label className="bindingRoute"><span>发送到</span><select value={plan.threadId ?? ""} onChange={(event) => void onRoute(event.target.value)}><option value="">新建一个 Codex 任务</option>{matching.map((thread) => <option key={thread.id} value={thread.id}>{thread.name}</option>)}{plan.threadId && !selected ? <option value={plan.threadId}>继续已选任务</option> : null}</select><ChevronDown size={13} /></label>
    </div>
  );
}

function StatusColumn({ status, todos, plans, onStatus, onLaunch }: {
  status: TodoStatus;
  todos: Todo[];
  plans: Plan[];
  onStatus: (todo: Todo, status: TodoStatus) => Promise<void>;
  onLaunch: (todo: Todo) => Promise<void>;
}) {
  const meta = STATUS_META[status];
  return (
    <section className={`statusColumn tone-${meta.tone}`}>
      <header className="columnHeader"><span className="statusDot" /><strong>{meta.label}</strong><em>{todos.length}</em><button aria-label={`${meta.label}菜单`}><MoreHorizontal size={17} /></button></header>
      <p className="columnDescription">{meta.description}</p>
      <div className="cardStack">
        {todos.map((todo) => <TodoCard key={todo.id} todo={todo} plan={plans.find((plan) => plan.id === todo.planId) ?? null} onStatus={onStatus} onLaunch={onLaunch} />)}
        {!todos.length ? <div className="columnEmpty"><span /><p>暂无 Todo</p></div> : null}
      </div>
    </section>
  );
}

function TodoCard({ todo, plan, onStatus, onLaunch }: {
  todo: Todo;
  plan: Plan | null;
  onStatus: (todo: Todo, status: TodoStatus) => Promise<void>;
  onLaunch: (todo: Todo) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const statusChoices = TODO_STATUSES.filter((status) =>
    (status !== "running" && status !== "completed") || status === todo.status,
  );
  const action = async (callback: () => Promise<void>) => {
    setBusy(true);
    try { await callback(); } finally { setBusy(false); }
  };
  return (
    <article className="todoCard">
      <div className="cardTopline">
        {plan ? <span className="miniPlan"><i style={{ background: plan.color }} />{plan.name}</span> : <span className="miniPlan neutral"><Inbox size={12} /> Inbox</span>}
        <label className="statusSelect" title="移动状态">
          <select value={todo.status} disabled={busy} onChange={(event) => void action(() => onStatus(todo, event.target.value as TodoStatus))}>
            {statusChoices.map((status) => <option key={status} value={status} disabled={status === "queued" && !plan}>{STATUS_META[status].label}</option>)}
          </select>
          <ChevronDown size={13} />
        </label>
      </div>
      <h3>{todo.title}</h3>
      {todo.description ? <p>{todo.description}</p> : null}
      <div className="cardFooter">
        <span><Clock3 size={13} /> {timeAgo(todo.updatedAt)}</span>
        {todo.sourceType === "screenshot" ? <span><ImagePlus size={13} /> 截图</span> : null}
        {todo.status === "queued" ? <button className="runButton" disabled={busy} onClick={() => void action(() => onLaunch(todo))}>{busy ? <LoaderCircle className="spin" size={14} /> : <Play size={14} fill="currentColor" />} 启动</button> : null}
        {todo.status === "running" ? <button className="doneButton" disabled={busy} onClick={() => void action(() => onStatus(todo, "completed"))}><Check size={14} /> 完成</button> : null}
        {todo.status === "completed" ? <Link className="completionLink" href={`/completion/${todo.id}`}>查看结果 <ArrowUpRight size={13} /></Link> : null}
      </div>
    </article>
  );
}

function PlanSheet({ projects, threads, onClose, onCreated, onError }: { projects: CodexProject[]; threads: CodexThread[]; onClose: () => void; onCreated: (plan: Plan) => Promise<void>; onError: (message: string) => void }) {
  const defaultProject = projects[0] ?? null;
  const [manualProject, setManualProject] = useState(!defaultProject);
  const [form, setForm] = useState<CreatePlanInput>({
    name: "",
    codexProjectId: defaultProject?.id ?? null,
    projectName: defaultProject?.name ?? "",
    projectRoot: defaultProject?.rootPath ?? "",
    branch: defaultProject?.branch || "main",
    threadId: null,
    color: "#769657",
  });
  const [busy, setBusy] = useState(false);
  const update = (key: keyof CreatePlanInput, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const chooseProject = (rootPath: string) => {
    const project = projects.find((candidate) => candidate.rootPath === rootPath) ?? null;
    setManualProject(!project);
    setForm((current) => ({
      ...current,
      codexProjectId: project?.id ?? null,
      projectName: project?.name ?? "",
      projectRoot: project?.rootPath ?? "",
      branch: project?.branch || "main",
      threadId: null,
    }));
  };
  const submit = async () => {
    setBusy(true);
    try {
      const plan = await api<Plan>("/api/plans", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          codexProjectId: form.codexProjectId ?? null,
          projectName: form.projectName.trim(),
          projectRoot: form.projectRoot.trim(),
          branch: form.branch || "main",
          color: form.color,
          ...(form.threadId ? { threadId: form.threadId } : {}),
        }),
      });
      await onCreated(plan);
    } catch (reason) {
      onError(friendlyError(reason));
    } finally { setBusy(false); }
  };
  return (
    <div className="sheetBackdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="planSheet">
        <header><div><p className="eyebrow">新建</p><h2>新建 Plan</h2></div><button className="iconButton" onClick={onClose}><X size={18} /></button></header>
        <p className="sheetIntro">给 Plan 起个名字，再选择项目。其他设置会自动完成。</p>
        <div className="formGrid">
          <label><span>名称</span><input autoFocus value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="例如：登录重构" /></label>
          <label><span>项目</span><div className="inputWithIcon projectSourceSelect"><FolderGit2 size={16} /><select value={manualProject ? "__manual__" : form.projectRoot} onChange={(event) => chooseProject(event.target.value)}>{projects.map((project) => <option key={`${project.id}:${project.rootPath}`} value={project.rootPath}>{project.name}</option>)}<option value="__manual__">其他项目…</option></select><ChevronDown size={14} /></div></label>
          {manualProject ? <>
            <label><span>项目名称</span><input value={form.projectName} onChange={(event) => update("projectName", event.target.value)} placeholder="Project A" /></label>
            <label className="wide"><span>项目位置</span><div className="inputWithIcon"><FolderGit2 size={16} /><input value={form.projectRoot} onChange={(event) => update("projectRoot", event.target.value)} placeholder="/Users/me/project-a" /></div></label>
          </> : null}
          <label className="wide"><span>发送到</span><select value={form.threadId ?? ""} onChange={(event) => update("threadId", event.target.value)}><option value="">新建一个 Codex 任务</option>{threads.filter((thread) => thread.cwd === form.projectRoot).map((thread) => <option key={thread.id} value={thread.id}>{thread.name}</option>)}</select></label>
        </div>
        <footer><button className="secondaryButton" onClick={onClose}>取消</button><button className="primaryButton" disabled={busy || !form.name.trim() || !form.projectName.trim() || !form.projectRoot.trim()} onClick={() => void submit()}>{busy ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />} 创建 Plan</button></footer>
      </aside>
    </div>
  );
}

function BoardSkeleton() {
  return <>{ACTIVE_STATUSES.map((status) => <section className="statusColumn skeletonColumn" key={status}><div className="skeleton line" /><div className="skeleton card" /><div className="skeleton card short" /></section>)}</>;
}
