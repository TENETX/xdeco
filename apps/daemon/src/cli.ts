#!/usr/bin/env node
import { isTodoStatus, TODO_STATUSES } from "@xdeco/shared";

const baseUrl = process.env.XDECO_URL ?? "http://127.0.0.1:4317";
const cliArgs = process.argv.slice(2); if (cliArgs[0] === "--") cliArgs.shift();
const [command, ...args] = cliArgs;

async function request(path: string, init?: RequestInit): Promise<any> {
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const body = await response.json(); if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`); return body;
}
function print(value: unknown): void { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); }
function usage(): never {
  process.stderr.write([
    "xdeco commands:",
    "  projects",
    "  project-add <name> <rootPath> [threadId]",
    "  todos [projectId]",
    "  add <title> [projectId] [draft|ready]",
    `  status <todoId> <${TODO_STATUSES.join("|")}> [projectId]`,
    "  dispatch <projectId>",
    "  retry <todoId>",
  ].join("\n") + "\n");
  process.exit(1);
}

try {
  if (command === "projects") print(await request("/api/projects"));
  else if (command === "project-add") {
    if (!args[0] || !args[1]) usage();
    print(await request("/api/projects", { method: "POST", body: JSON.stringify({ name: args[0], rootPath: args[1], targetThreadId: args[2] ?? null }) }));
  } else if (command === "todos") {
    print(await request(`/api/todos${args[0] ? `?projectId=${encodeURIComponent(args[0])}` : ""}`));
  } else if (command === "add") {
    if (!args[0]) usage();
    print(await request("/api/todos", { method: "POST", body: JSON.stringify({ title: args[0], projectId: args[1] ?? null, status: args[2] ?? "draft" }) }));
  } else if (command === "status") {
    if (!args[0] || !isTodoStatus(args[1])) usage();
    print(await request(`/api/todos/${args[0]}/status`, { method: "PATCH", body: JSON.stringify({ status: args[1], projectId: args[2] }) }));
  } else if (command === "dispatch") {
    if (!args[0]) usage(); print(await request(`/api/projects/${args[0]}/dispatch`, { method: "POST", body: "{}" }));
  } else if (command === "retry") {
    if (!args[0]) usage(); print(await request(`/api/todos/${args[0]}/retry`, { method: "POST", body: "{}" }));
  } else usage();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exit(1);
}
