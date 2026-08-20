#!/usr/bin/env node
import { isTodoStatus, TODO_STATUSES } from "@whomi/shared";

const baseUrl = process.env.WHOMI_URL ?? "http://127.0.0.1:4317";
const cliArgs = process.argv.slice(2);
if (cliArgs[0] === "--") cliArgs.shift();
const [command, ...args] = cliArgs;

async function request(path: string, init?: RequestInit): Promise<any> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
  return body;
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function usage(): never {
  process.stderr.write(`whomi commands:\n`);
  process.stderr.write(`  plans\n`);
  process.stderr.write(`  plan-add <name> <projectName> <projectRoot> <branch> [worktreePath] [threadId]\n`);
  process.stderr.write(`  worktree <planId> [baseRef]\n`);
  process.stderr.write(`  todos [planId]\n`);
  process.stderr.write(`  add <title> [planId]\n`);
  process.stderr.write(`  status <todoId> <${TODO_STATUSES.join("|")}> [planId]\n`);
  process.stderr.write(`  launch <todoId>\n`);
  process.stderr.write(`  complete <todoId> [summary]\n`);
  process.exit(1);
}

try {
  if (command === "plans") print(await request("/api/plans"));
  else if (command === "plan-add") {
    if (!args[0] || !args[1] || !args[2] || !args[3]) usage();
    print(await request("/api/plans", {
      method: "POST",
      body: JSON.stringify({
        name: args[0], projectName: args[1], projectRoot: args[2], branch: args[3],
        worktreePath: args[4], threadId: args[5] ?? null,
      }),
    }));
  } else if (command === "worktree") {
    if (!args[0]) usage();
    print(await request(`/api/plans/${args[0]}/worktree`, {
      method: "POST",
      body: JSON.stringify({ baseRef: args[1] }),
    }));
  }
  else if (command === "todos") print(await request(`/api/todos${args[0] ? `?planId=${encodeURIComponent(args[0])}` : ""}`));
  else if (command === "add") {
    if (!args[0]) usage();
    print(await request("/api/todos", {
      method: "POST",
      body: JSON.stringify({ title: args[0], planId: args[1] ?? null, status: args[1] ? "queued" : "someday" }),
    }));
  } else if (command === "status") {
    if (!args[0] || !isTodoStatus(args[1])) usage();
    print(await request(`/api/todos/${args[0]}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: args[1], planId: args[2] }),
    }));
  } else if (command === "launch") {
    if (!args[0]) usage();
    print(await request(`/api/todos/${args[0]}/launch`, { method: "POST", body: "{}" }));
  } else if (command === "complete") {
    if (!args[0]) usage();
    print(await request(`/api/todos/${args[0]}/complete`, {
      method: "POST",
      body: JSON.stringify({ summary: args.slice(1).join(" ") }),
    }));
  } else usage();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
