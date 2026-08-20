"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Copy, ExternalLink, GitBranch, MessageSquareCode } from "lucide-react";
import type { Todo } from "@plan-orchestrator/shared";

export default function CompletionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [todo, setTodo] = useState<Todo | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/todos/${id}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "加载失败");
        setTodo(body);
      })
      .catch((reason) => setError(String(reason)));
  }, [id]);

  const copy = (value: string | null) => {
    if (value) void navigator.clipboard.writeText(value);
  };

  return (
    <main className="completionPage">
      <section className="completionCard">
        <Link className="backLink" href="/">
          <ArrowLeft size={16} /> 返回控制台
        </Link>
        {error ? <div className="errorBanner">{error}</div> : null}
        {!todo && !error ? <div className="completionLoading">正在读取完成记录…</div> : null}
        {todo ? (
          <>
            <div className="completionIcon"><CheckCircle2 size={26} /></div>
            <p className="eyebrow">COMPLETION RECEIPT</p>
            <h1>{todo.title}</h1>
            <p className="completionSummary">{todo.completionSummary || "这个 Todo 已完成，下面是对应的 Codex 执行位置。"}</p>
            <div className="receiptGrid">
              <div className="receiptRow">
                <span><MessageSquareCode size={16} /> Codex task</span>
                <code>{todo.completionThreadId ?? "未记录"}</code>
                <button aria-label="复制 task ID" onClick={() => copy(todo.completionThreadId)}><Copy size={15} /></button>
              </div>
              <div className="receiptRow">
                <span><GitBranch size={16} /> Turn</span>
                <code>{todo.completionTurnId ?? "未记录"}</code>
                <button aria-label="复制 turn ID" onClick={() => copy(todo.completionTurnId)}><Copy size={15} /></button>
              </div>
            </div>
            <div className="routeNote">
              <ExternalLink size={16} />
              <p>这是稳定的插件内精确链接。它保留 task + turn；接入 Codex 原生 turn deep link 后只需替换这一层路由。</p>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}

