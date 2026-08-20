import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { CreatePlanInput, CreateTodoInput, TodoStatus } from "@plan-orchestrator/shared";
import { isTodoStatus } from "@plan-orchestrator/shared";
import { DAEMON_HOST, DAEMON_PORT, DATA_DIR } from "./config.js";
import { PlanService } from "./service.js";

const service = new PlanService();

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "http://localhost:3000",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
  });
  response.end(JSON.stringify(body));
}

async function jsonBody(request: IncomingMessage): Promise<Record<string, any>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > 12 * 1024 * 1024) throw new Error("Request body is too large");
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, any>;
}

async function persistImage(image: unknown): Promise<string | null> {
  if (!image || typeof image !== "object") return null;
  const candidate = image as { name?: unknown; dataBase64?: unknown };
  if (typeof candidate.dataBase64 !== "string" || !candidate.dataBase64) return null;
  const buffer = Buffer.from(candidate.dataBase64, "base64");
  if (buffer.byteLength > 10 * 1024 * 1024) throw new Error("Screenshot must be smaller than 10 MB");
  const rawExtension = typeof candidate.name === "string" ? extname(candidate.name).toLowerCase() : ".png";
  const extension = [".png", ".jpg", ".jpeg", ".webp"].includes(rawExtension) ? rawExtension : ".png";
  const uploads = join(DATA_DIR, "uploads");
  await mkdir(uploads, { recursive: true });
  const path = join(uploads, `${randomUUID()}${extension}`);
  await writeFile(path, buffer, { flag: "wx" });
  return path;
}

async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method === "OPTIONS") return send(response, 204, null);
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const path = url.pathname;

  if (request.method === "GET" && path === "/health") {
    return send(response, 200, { ok: true, service: "plan-orchestrator", version: "0.1.0" });
  }

  if (request.method === "GET" && path === "/api/overview") {
    return send(response, 200, await service.overview(url.searchParams.get("planId") ?? undefined));
  }

  if (request.method === "GET" && path === "/api/codex-projects") {
    return send(response, 200, await service.listCodexProjects());
  }

  if (path === "/api/plans" && request.method === "GET") {
    return send(response, 200, service.listPlans());
  }
  if (path === "/api/plans" && request.method === "POST") {
    const body = await jsonBody(request);
    return send(response, 201, service.createPlan(body as CreatePlanInput));
  }
  const planMatch = path.match(/^\/api\/plans\/([^/]+)$/);
  if (planMatch && request.method === "PATCH") {
    const body = await jsonBody(request);
    return send(response, 200, service.updatePlan(planMatch[1]!, body));
  }
  const worktreeMatch = path.match(/^\/api\/plans\/([^/]+)\/worktree$/);
  if (worktreeMatch && request.method === "POST") {
    const body = await jsonBody(request);
    return send(response, 200, await service.ensureWorktree(worktreeMatch[1]!, body.baseRef));
  }

  if (path === "/api/todos" && request.method === "GET") {
    const includeEnded = url.searchParams.get("includeEnded") !== "false";
    return send(response, 200, service.listTodos(url.searchParams.get("planId"), includeEnded));
  }
  if (path === "/api/todos" && request.method === "POST") {
    const body = await jsonBody(request);
    return send(response, 201, service.createTodo(body as CreateTodoInput));
  }
  const todoMatch = path.match(/^\/api\/todos\/([^/]+)$/);
  if (todoMatch && request.method === "GET") {
    return send(response, 200, service.getTodo(todoMatch[1]!));
  }
  const statusMatch = path.match(/^\/api\/todos\/([^/]+)\/status$/);
  if (statusMatch && request.method === "PATCH") {
    const body = await jsonBody(request);
    if (!isTodoStatus(body.status)) throw new Error("Invalid todo status");
    return send(response, 200, service.setStatus(statusMatch[1]!, body.status as TodoStatus, body.planId));
  }
  const launchMatch = path.match(/^\/api\/todos\/([^/]+)\/launch$/);
  if (launchMatch && request.method === "POST") {
    return send(response, 202, await service.launch(launchMatch[1]!));
  }
  const completeMatch = path.match(/^\/api\/todos\/([^/]+)\/complete$/);
  if (completeMatch && request.method === "POST") {
    const body = await jsonBody(request);
    return send(response, 200, service.complete(completeMatch[1]!, body));
  }

  if (path === "/api/capture" && request.method === "POST") {
    const body = await jsonBody(request);
    const imagePath = await persistImage(body.image);
    return send(
      response,
      201,
      await service.capture(typeof body.text === "string" ? body.text : "", imagePath, body.planId),
    );
  }

  send(response, 404, { error: "Not found" });
}

const server = createServer((request, response) => {
  void route(request, response).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    send(response, message.toLowerCase().includes("not found") ? 404 : 400, { error: message });
  });
});

server.listen(DAEMON_PORT, DAEMON_HOST, () => {
  process.stdout.write(`Plan Orchestrator API listening on http://${DAEMON_HOST}:${DAEMON_PORT}\n`);
});

function shutdown(): void {
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
