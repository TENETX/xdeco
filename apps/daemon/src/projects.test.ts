import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CodexProjectCatalog } from "./projects.js";

test("discovers Codex local projects in recency order", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "whomi-projects-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const recentRoot = join(directory, "recent");
  const olderRoot = join(directory, "older");
  await Promise.all([mkdir(recentRoot), mkdir(olderRoot)]);
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
  });
});

test("returns an empty project list when Codex state is unavailable", async () => {
  assert.deepEqual(await new CodexProjectCatalog("/missing/codex-state.json").list(), []);
});
