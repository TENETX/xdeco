import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import type { CodexProject } from "@xdeco/shared";
import { CODEX_GLOBAL_STATE_PATH } from "./config.js";

interface StoredCodexProject {
  id?: unknown;
  name?: unknown;
  rootPaths?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

interface CodexGlobalState {
  "local-projects"?: Record<string, StoredCodexProject>;
}

export interface ProjectCatalog {
  list(): Promise<CodexProject[]>;
}

async function readState(path: string): Promise<CodexGlobalState> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return JSON.parse(await readFile(path, "utf8")) as CodexGlobalState;
    } catch (error) {
      lastError = error;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  throw lastError;
}

export class CodexProjectCatalog implements ProjectCatalog {
  constructor(readonly statePath = CODEX_GLOBAL_STATE_PATH) {}

  async list(): Promise<CodexProject[]> {
    let state: CodexGlobalState;
    try {
      state = await readState(this.statePath);
    } catch {
      return [];
    }

    const stored = Object.entries(state["local-projects"] ?? {})
      .map(([key, project]) => ({
        key,
        project,
        sortAt: typeof project.updatedAt === "number"
          ? project.updatedAt
          : typeof project.createdAt === "number" ? project.createdAt : 0,
      }))
      .sort((left, right) => right.sortAt - left.sortAt);

    const discovered = await Promise.all(stored.flatMap(({ key, project }) => {
      if (!Array.isArray(project.rootPaths)) return [];
      return project.rootPaths.flatMap((candidate) => {
        if (typeof candidate !== "string" || !candidate) return [];
        return [this.describeRoot(
          typeof project.id === "string" && project.id ? project.id : key,
          typeof project.name === "string" && project.name ? project.name : basename(candidate),
          candidate,
        )];
      });
    }));

    return discovered.filter((project): project is CodexProject => project !== null);
  }

  private async describeRoot(id: string, name: string, rootPath: string): Promise<CodexProject | null> {
    try {
      if (!(await stat(rootPath)).isDirectory()) return null;
    } catch {
      return null;
    }
    return { id, name, rootPath };
  }
}
