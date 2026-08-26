import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

type LocalToolHandler = (name: string, args: Record<string, unknown>) => Promise<unknown>;

function send(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(value));
}

async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("请求格式不正确");
  return value as Record<string, unknown>;
}

/** Hosts the MCP widget in a normal local browser tab for Codex, which does not render ui:// MCP apps. */
export class LocalUiServer {
  private server: Server | null = null;
  private url: string | null = null;

  constructor(private readonly html: string, private readonly invoke: LocalToolHandler) {}

  async ensure(): Promise<string> {
    if (this.url) return this.url;

    for (let port = 4318; port < 4330; port += 1) {
      const server = createServer((request, response) => void this.handle(request, response));
      try {
        await new Promise<void>((resolve, reject) => {
          server.once("error", reject);
          server.listen(port, "127.0.0.1", () => {
            server.off("error", reject);
            resolve();
          });
        });
        this.server = server;
        this.url = `http://127.0.0.1:${port}/`;
        return this.url;
      } catch {
        server.close();
      }
    }
    throw new Error("无法启动 xdeco 本地看板服务");
  }

  async close(): Promise<void> {
    const server = this.server;
    this.server = null;
    this.url = null;
    if (!server) return;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    if (request.method === "GET" && path === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      response.end(this.html);
      return;
    }
    if (request.method === "POST" && path === "/api/tool") {
      try {
        const payload = await body(request);
        if (typeof payload.name !== "string") throw new Error("缺少工具名称");
        const args = payload.args && typeof payload.args === "object" && !Array.isArray(payload.args)
          ? payload.args as Record<string, unknown>
          : {};
        send(response, 200, { structuredContent: { result: await this.invoke(payload.name, args) } });
      } catch (error) {
        send(response, 400, { error: error instanceof Error ? error.message : "操作未完成" });
      }
      return;
    }
    send(response, 404, { error: "Not found" });
  }
}
