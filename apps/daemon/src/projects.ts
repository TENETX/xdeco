import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { promisify } from "node:util";
import type { CodexProject } from "@whomi/shared";
import { CODEX_GLOBAL_STATE_PATH } from "./config.js";

const execFileAsync = promisify(execFile);

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

async function gitMetadata(rootPath: string): Promise<Pick<CodexProject, "branch" | "isGitRepository">> {
  try {
    await execFileAsync("git", ["-C", rootPath, "rev-parse", "--show-toplevel"]);
    const { stdout } = await execFileAsync("git", ["-C", rootPath, "branch", "--show-current"]);
    return { branch: stdout.trim() || "HEAD", isGitRepository: true };
  } catch {
    return { branch: null, isGitRepository: false };
  }
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
    return { id, name, rootPath, ...(await gitMetadata(rootPath)) };
  }
}
