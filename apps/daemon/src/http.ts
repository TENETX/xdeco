import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { CreateProjectInput, CreateTodoInput } from "@whomi/shared";
import { isTodoStatus } from "@whomi/shared";
import { DAEMON_HOST, DAEMON_PORT, DATA_DIR } from "./config.js";
import { WhomiService } from "./service.js";

const service = new WhomiService();

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
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
  if (request.method === "GET" && path === "/health") return send(response, 200, { ok: true, service: "whomi", version: "0.2.0" });
  if (request.method === "GET" && path === "/api/overview") return send(response, 200, await service.overview(url.searchParams.get("projectId") ?? undefined));

  if (path === "/api/projects" && request.method === "GET") return send(response, 200, service.listProjects());
  if (path === "/api/projects" && request.method === "POST") return send(response, 201, service.createProject(await jsonBody(request) as CreateProjectInput));
  const projectMatch = path.match(/^\/api\/projects\/([^/]+)$/);
  if (projectMatch && request.method === "PATCH") return send(response, 200, service.updateProject(projectMatch[1]!, await jsonBody(request)));
  const queueMatch = path.match(/^\/api\/projects\/([^/]+)\/dispatch$/);
  if (queueMatch && request.method === "POST") return send(response, 202, service.startProjectQueue(queueMatch[1]!));

  if (path === "/api/todos" && request.method === "GET") return send(response, 200, service.listTodos(url.searchParams.get("projectId"), url.searchParams.get("includeArchived") === "true"));
  if (path === "/api/todos" && request.method === "POST") return send(response, 201, service.addTodo(await jsonBody(request) as CreateTodoInput));
  const todoMatch = path.match(/^\/api\/todos\/([^/]+)$/);
  if (todoMatch && request.method === "GET") return send(response, 200, service.getTodo(todoMatch[1]!));
  const statusMatch = path.match(/^\/api\/todos\/([^/]+)\/status$/);
  if (statusMatch && request.method === "PATCH") {
    const body = await jsonBody(request);
    if (!isTodoStatus(body.status)) throw new Error("Invalid todo status");
    return send(response, 200, service.setStatus(statusMatch[1]!, body.status, body.projectId));
  }
  const retryMatch = path.match(/^\/api\/todos\/([^/]+)\/retry$/);
  if (retryMatch && request.method === "POST") return send(response, 200, service.retryTodo(retryMatch[1]!));

  if (path === "/api/capture" && request.method === "POST") {
    const body = await jsonBody(request);
    return send(response, 201, await service.capture(typeof body.text === "string" ? body.text : "", await persistImage(body.image), body.projectId));
  }
  send(response, 404, { error: "Not found" });
}

const server = createServer((request, response) => void route(request, response).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  send(response, message.toLowerCase().includes("not found") ? 404 : 400, { error: message });
}));

server.listen(DAEMON_PORT, DAEMON_HOST, () => process.stdout.write(`whomi API listening on http://${DAEMON_HOST}:${DAEMON_PORT}\n`));
function shutdown(): void { server.close(() => process.exit(0)); }
process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown);
