"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, File, Link2 } from "lucide-react";
import type { TodoResult } from "@xdeco/shared";

export default function CompletionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [result, setResult] = useState<TodoResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/todos/${id}/result`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? "结果加载失败");
        setResult(body as TodoResult);
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => controller.abort();
  }, [id]);

  return (
    <main className="completionPage">
      <section className="completionCard">
        <Link className="backLink" href="/"><ArrowLeft size={16} />返回 Todo</Link>
        <div className="completionSurface">
          {error ? <div className="errorBanner" role="alert">{error}</div> : null}
          {!result && !error ? <div className="completionLoading"><span>正在读取执行结果…</span></div> : null}
          {result ? (
            <>
              <div className="completionIcon"><CheckCircle2 size={26} /></div>
              <h1>{result.title}</h1>
              <p className="resultAnswer">{result.answer || "这次执行没有留下可展示的 AI 回复。"}</p>
              <h2>产出物</h2>
              {result.artifacts.length ? (
                <ul className="artifactList">
                  {result.artifacts.map((artifact) => (
                    <li key={artifact.uri}>
                      {artifact.kind === "file" ? <File size={17} /> : <Link2 size={17} />}
                      {artifact.kind === "link" ? (
                        <a href={artifact.uri} target="_blank" rel="noreferrer"><strong>{artifact.name}</strong><code>{artifact.uri}</code></a>
                      ) : (
                        <span><strong>{artifact.name}</strong><code>{artifact.uri}</code></span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : <div className="iosEmpty"><p>这次没有生成文件或链接。</p></div>}
            </>
          ) : null}
        </div>
      </section>
    </main>
  );
}
