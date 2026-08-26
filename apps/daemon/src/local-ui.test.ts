import assert from "node:assert/strict";
import test from "node:test";
import { LocalUiServer } from "./local-ui.js";

test("serves the local xdeco page and its tool bridge", async () => {
  const ui = new LocalUiServer("<!doctype html><title>xdeco</title>", async (name, args) => ({ name, args }));
  try {
    const url = await ui.ensure();
    const page = await fetch(url).then((response) => response.text());
    const response = await fetch(`${url}api/tool`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "get_overview", args: { sample: true } }),
    });
    assert.equal(page.includes("xdeco"), true);
    assert.equal(response.ok, true);
    assert.deepEqual(await response.json(), {
      structuredContent: { result: { name: "get_overview", args: { sample: true } } },
    });
  } finally {
    await ui.close();
  }
});
