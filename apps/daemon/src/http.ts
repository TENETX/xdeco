import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { CreateProjectInput, CreateQueueInput, CreateTodoInput } from "@xdeco/shared";
import { isTodoMode, isTodoStatus } from "@xdeco/shared";
import { DAEMON_HOST, DAEMON_PORT, DATA_DIR } from "./config.js";
import { XdecoService } from "./service.js";
import { publicError } from "./errors.js";

const service = new XdecoService();

function send(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(payload);
}

async function jsonBody(request: IncomingMessage): Promise<Record<string, any>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk); size += buffer.byteLength;
    if (size > 12 * 1024 * 1024) throw new Error("Request body is too large");
    chunks.push(buffer);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, any> : {};
}

async function persistImage(image: unknown): Promise<string | null> {
  if (!image || typeof image !== "object") return null;
  const candidate = image as { name?: unknown; dataBase64?: unknown };
  if (typeof candidate.dataBase64 !== "string" || !candidate.dataBase64) return null;
  const buffer = Buffer.from(candidate.dataBase64, "base64");
  if (buffer.byteLength > 10 * 1024 * 1024) throw new Error("Screenshot must be smaller than 10 MB");
  const raw = typeof candidate.name === "string" ? extname(candidate.name).toLowerCase() : ".png";
  const extension = [".png", ".jpg", ".jpeg", ".webp"].includes(raw) ? raw : ".png";
  const uploads = join(DATA_DIR, "uploads"); await mkdir(uploads, { recursive: true });
  const path = join(uploads, `${randomUUID()}${extension}`); await writeFile(path, buffer, { flag: "wx" });
  return path;
}

async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const path = url.pathname;
  if (request.method === "GET" && path === "/health") return send(response, 200, { ok: true, service: "xdeco", version: "0.2.0" });
  if (request.method === "GET" && path === "/api/overview") return send(response, 200, await service.overview(url.searchParams.get("projectId") ?? undefined));

  if (path === "/api/projects" && request.method === "GET") return send(response, 200, service.listProjects());
  if (path === "/api/projects" && request.method === "POST") return send(response, 201, service.createProject(await jsonBody(request) as CreateProjectInput));
  const projectMatch = path.match(/^\/api\/projects\/([^/]+)$/);
  if (projectMatch && request.method === "PATCH") return send(response, 200, service.updateProject(projectMatch[1]!, await jsonBody(request)));
  const queueMatch = path.match(/^\/api\/projects\/([^/]+)\/dispatch$/);
  if (queueMatch && request.method === "POST") return send(response, 202, service.startProjectQueue(queueMatch[1]!));

  if (path === "/api/queues" && request.method === "GET") return send(response, 200, service.listQueues(url.searchParams.get("projectId") ?? undefined));
  if (path === "/api/queues" && request.method === "POST") return send(response, 201, await service.createQueue(await jsonBody(request) as CreateQueueInput));
  const laneMatch = path.match(/^\/api\/queues\/([^/]+)$/);
  if (laneMatch && request.method === "PATCH") return send(response, 200, service.updateQueue(laneMatch[1]!, await jsonBody(request)));
  if (laneMatch && request.method === "DELETE") return send(response, 200, service.deleteQueue(laneMatch[1]!));
  const laneDispatchMatch = path.match(/^\/api\/queues\/([^/]+)\/dispatch$/);
  if (laneDispatchMatch && request.method === "POST") return send(response, 202, service.startQueue(laneDispatchMatch[1]!));

  if (path === "/api/todos" && request.method === "GET") return send(response, 200, service.listTodos(url.searchParams.get("projectId"), url.searchParams.get("includeArchived") === "true"));
  if (path === "/api/todos" && request.method === "POST") return send(response, 201, service.addTodo(await jsonBody(request) as CreateTodoInput));
  const todoMatch = path.match(/^\/api\/todos\/([^/]+)$/);
  if (todoMatch && request.method === "GET") return send(response, 200, service.getTodo(todoMatch[1]!));
  if (todoMatch && request.method === "PATCH") {
    const body = await jsonBody(request);
    if (!isTodoMode(body.mode)) throw new Error("Invalid todo mode");
    return send(response, 200, service.setMode(todoMatch[1]!, body.mode));
  }
  const resultMatch = path.match(/^\/api\/todos\/([^/]+)\/result$/);
  if (resultMatch && request.method === "GET") return send(response, 200, await service.getTodoResult(resultMatch[1]!));
  const statusMatch = path.match(/^\/api\/todos\/([^/]+)\/status$/);
  if (statusMatch && request.method === "PATCH") {
    const body = await jsonBody(request);
    if (!isTodoStatus(body.status)) throw new Error("Invalid todo status");
    return send(response, 200, service.setStatus(statusMatch[1]!, body.status, body.projectId));
  }
  const retryMatch = path.match(/^\/api\/todos\/([^/]+)\/retry$/);
  if (retryMatch && request.method === "POST") return send(response, 200, service.retryTodo(retryMatch[1]!));
  const queueTodoMatch = path.match(/^\/api\/todos\/([^/]+)\/queue$/);
  if (queueTodoMatch && request.method === "PATCH") {
    const body = await jsonBody(request);
    if (typeof body.queueId !== "string" || !body.queueId) throw new Error("queueId is required");
    if (body.beforeTodoId != null && typeof body.beforeTodoId !== "string") throw new Error("Invalid beforeTodoId");
    return send(response, 200, service.queueTodo(queueTodoMatch[1]!, body.queueId, body.beforeTodoId));
  }

  if (path === "/api/capture" && request.method === "POST") {
    const body = await jsonBody(request);
    return send(response, 201, await service.capture(typeof body.text === "string" ? body.text : "", await persistImage(body.image), body.projectId));
  }
  send(response, 404, { error: "Not found" });
}

const server = createServer((request, response) => void route(request, response).catch((error) => {
  const detail = publicError(error);
  send(response, detail.code.endsWith("not_found") ? 404 : 400, { error: detail });
}));

server.listen(DAEMON_PORT, DAEMON_HOST, () => process.stdout.write(`xdeco API listening on http://${DAEMON_HOST}:${DAEMON_PORT}\n`));
function shutdown(): void { server.close(() => process.exit(0)); }
process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown);
