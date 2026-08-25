import assert from "node:assert/strict";
import test from "node:test";
import { renderMarkdown } from "./markdown.js";

test("renders GitHub-flavored Markdown for result views", () => {
  const html = renderMarkdown([
    "## 验证结果",
    "",
    "- **测试通过**",
    "- 使用 `pnpm test`",
    "",
    "```bash",
    "pnpm test",
    "```",
  ].join("\n"));

  assert.match(html, /<h2>验证结果<\/h2>/);
  assert.match(html, /<ul>[\s\S]*<strong>测试通过<\/strong>/);
  assert.match(html, /<code>pnpm test<\/code>/);
  assert.match(html, /<pre><code class="language-bash">pnpm test/);
});

test("sanitizes unsafe model output and hardens external links", () => {
  const html = renderMarkdown([
    "<script>alert('xss')</script>",
    "[危险链接](javascript:alert('xss'))",
    "[文档](https://example.com/docs)",
  ].join("\n\n"));

  assert.doesNotMatch(html, /<script|javascript:/i);
  assert.match(html, /href="https:\/\/example\.com\/docs"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noreferrer noopener"/);
});
