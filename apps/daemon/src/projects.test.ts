import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { CodexProjectCatalog } from "./projects.js";

const execFileAsync = promisify(execFile);

test("discovers Codex local projects in recency order with Git metadata", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "plan-orchestrator-projects-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const recentRoot = join(directory, "recent");
  const olderRoot = join(directory, "older");
  await Promise.all([mkdir(recentRoot), mkdir(olderRoot)]);
  await execFileAsync("git", ["init", "-b", "feat/recent", recentRoot]);
  const statePath = join(directory, ".codex-global-state.json");
  await writeFile(statePath, JSON.stringify({
    "local-projects": {
      older: { id: "older", name: "Older", rootPaths: [olderRoot], createdAt: 10, updatedAt: 10 },
      recent: { id: "recent", name: "Recent", rootPaths: [recentRoot], createdAt: 20, updatedAt: 20 },
      missing: { id: "missing", name: "Missing", rootPaths: [join(directory, "missing")], updatedAt: 30 },
    },
  }));

  const projects = await new CodexProjectCatalog(statePath).list();

  assert.deepEqual(projects.map((project) => project.name), ["Recent", "Older"]);
  assert.deepEqual(projects[0], {
    id: "recent",
    name: "Recent",
    rootPath: recentRoot,
    branch: "feat/recent",
    isGitRepository: true,
  });
  assert.equal(projects[1]?.isGitRepository, false);
  assert.equal(projects[1]?.branch, null);
});

test("returns an empty project list when Codex state is unavailable", async () => {
  assert.deepEqual(await new CodexProjectCatalog("/missing/codex-state.json").list(), []);
});
