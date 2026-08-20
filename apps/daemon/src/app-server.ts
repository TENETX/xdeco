import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { setTimeout as delay } from "node:timers/promises";
import type { CodexThread } from "@whomi/shared";

type JsonObject = Record<string, unknown>;

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: Error) => void;
}

interface TurnSnapshot {
  status: "completed" | "failed" | "interrupted";
  text: string;
  error: string | null;
}

interface ListedThread {
  id: string;
  name: string | null;
  preview: string;
  cwd: string;
  updatedAt: number;
  status: { type: CodexThread["status"] };
  ephemeral: boolean;
}

interface ReadThreadTurn {
  id: string;
  status: string;
  items?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
}

export class CodexAppServer {
  private child: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly turnText = new Map<string, string>();
  private readonly finishedTurns = new Map<string, TurnSnapshot>();
  private readonly turnWaiters = new Map<string, Array<(value: TurnSnapshot) => void>>();
  private startPromise: Promise<void> | null = null;

  async available(): Promise<boolean> {
    try {
      await this.start();
      return true;
    } catch {
      return false;
    }
  }

  async start(): Promise<void> {
    if (this.child) return;
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.connect();
    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  private async connect(): Promise<void> {
    const child = spawn("codex", ["app-server"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
    this.child = child;
    child.stderr.on("data", (chunk) => process.stderr.write(`[codex app-server] ${chunk}`));
    child.on("exit", (code) => {
      this.child = null;
      const error = new Error(`codex app-server exited with code ${code ?? "unknown"}`);
      for (const request of this.pending.values()) request.reject(error);
      this.pending.clear();
    });

    const lines = createInterface({ input: child.stdout });
    lines.on("line", (line) => {
      try {
        this.handle(JSON.parse(line) as JsonObject);
      } catch (error) {
        process.stderr.write(`[whomi] invalid app-server message: ${String(error)}\n`);
      }
    });

    await this.request("initialize", {
      clientInfo: {
        name: "whomi",
        title: "whomi",
        version: "0.1.0",
      },
      capabilities: { experimentalApi: true },
    });
    this.notify("initialized", {});
  }

  private handle(message: JsonObject): void {
    if (typeof message.id === "number" && ("result" in message || "error" in message)) {
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);
      if (message.error) {
        const error = message.error as { message?: string };
        request.reject(new Error(error.message ?? "Codex App Server request failed"));
      } else {
        request.resolve(message.result);
      }
      return;
    }

    if (typeof message.id === "number" && typeof message.method === "string") {
      this.write({ id: message.id, error: { code: -32601, message: "Client method not supported" } });
      return;
    }

    if (typeof message.method !== "string") return;
    const params = (message.params ?? {}) as JsonObject;
    if (message.method === "item/completed") {
      const turnId = typeof params.turnId === "string" ? params.turnId : null;
      const item = (params.item ?? {}) as JsonObject;
      if (turnId && item.type === "agentMessage" && typeof item.text === "string") {
        this.turnText.set(turnId, item.text);
      }
    }
    if (message.method === "turn/completed") {
      const turn = (params.turn ?? {}) as JsonObject;
      const turnId = typeof turn.id === "string" ? turn.id : null;
      if (!turnId) return;
      const status = (turn.status as TurnSnapshot["status"]) ?? "failed";
      const errorObject = turn.error as { message?: string } | null;
      const snapshot: TurnSnapshot = {
        status,
        text: this.turnText.get(turnId) ?? "",
        error: errorObject?.message ?? null,
      };
      this.finishedTurns.set(turnId, snapshot);
      for (const waiter of this.turnWaiters.get(turnId) ?? []) waiter(snapshot);
      this.turnWaiters.delete(turnId);
    }
  }

  private write(message: JsonObject): void {
    if (!this.child) throw new Error("Codex App Server is not running");
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private notify(method: string, params: JsonObject): void {
    this.write({ method, params });
  }

  async request<T = any>(method: string, params: JsonObject): Promise<T> {
    if (method !== "initialize") await this.start();
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.write({ id, method, params });
    });
  }

  async startThread(params: JsonObject): Promise<string> {
    const result = await this.request<{ thread: { id: string } }>("thread/start", params);
    return result.thread.id;
  }

  async resumeThread(threadId: string): Promise<void> {
    await this.request("thread/resume", { threadId });
  }

  async listThreads(limit = 100): Promise<CodexThread[]> {
    const result = await this.request<{ data: ListedThread[] }>("thread/list", {
      limit,
      sortKey: "recency_at",
      sortDirection: "desc",
      archived: false,
    });
    return result.data
      .filter((thread) => !thread.ephemeral && Boolean(thread.id) && Boolean(thread.cwd))
      .map((thread) => ({
        id: thread.id,
        name: thread.name?.trim() || thread.preview.trim().split(/\r?\n/)[0]?.slice(0, 100) || "未命名任务",
        cwd: thread.cwd,
        status: thread.status.type,
        updatedAt: new Date(thread.updatedAt * 1000).toISOString(),
      }));
  }

  async startTurn(params: JsonObject): Promise<string> {
    const result = await this.request<{ turn: { id: string } }>("turn/start", params);
    return result.turn.id;
  }

  async findTurnContainingUserText(
    threadId: string,
    needle: string,
    timeoutMs = 3_000,
  ): Promise<{ id: string; status: string } | null> {
    const deadline = Date.now() + timeoutMs;
    do {
      const result = await this.request<{ thread: { turns?: ReadThreadTurn[] } }>("thread/read", {
        threadId,
        includeTurns: true,
      });
      const turns = result.thread.turns ?? [];
      for (let index = turns.length - 1; index >= 0; index -= 1) {
        const turn = turns[index];
        if (!turn) continue;
        const matches = (turn.items ?? []).some((item) =>
          item.type === "userMessage"
          && (item.content ?? []).some((content) => content.type === "text" && content.text?.includes(needle)),
        );
        if (matches) return { id: turn.id, status: turn.status };
      }
      if (Date.now() < deadline) await delay(150);
    } while (Date.now() < deadline);
    return null;
  }

  async waitForTurn(turnId: string, timeoutMs = 120_000): Promise<TurnSnapshot> {
    const finished = this.finishedTurns.get(turnId);
    if (finished) return finished;
    return new Promise<TurnSnapshot>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timed out waiting for Codex turn ${turnId}`));
      }, timeoutMs);
      const waiter = (snapshot: TurnSnapshot) => {
        clearTimeout(timeout);
        resolve(snapshot);
      };
      const waiters = this.turnWaiters.get(turnId) ?? [];
      waiters.push(waiter);
      this.turnWaiters.set(turnId, waiters);
    });
  }
}
