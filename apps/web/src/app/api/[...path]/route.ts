import { NextRequest, NextResponse } from "next/server";

const daemonUrl = process.env.XDECO_URL ?? "http://127.0.0.1:4317";

type Context = { params: Promise<{ path: string[] }> };

async function proxy(request: NextRequest, context: Context) {
  const { path } = await context.params;
  const target = new URL(`/api/${path.join("/")}`, daemonUrl);
  target.search = request.nextUrl.search;
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers: { "content-type": request.headers.get("content-type") ?? "application/json" },
      body: hasBody ? await request.arrayBuffer() : undefined,
      cache: "no-store",
    });
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: `本地守护进程未启动：${error instanceof Error ? error.message : String(error)}` },
      { status: 503 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
