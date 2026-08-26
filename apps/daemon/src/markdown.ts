import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [
  "p", "br", "strong", "em", "del", "blockquote", "ul", "ol", "li",
  "h1", "h2", "h3", "h4", "h5", "h6", "pre", "code", "a", "hr",
  "table", "thead", "tbody", "tr", "th", "td",
];

export function renderMarkdown(markdown: string): string {
  const rendered = marked.parse(markdown, { async: false, gfm: true });
  if (typeof rendered !== "string") throw new Error("Markdown rendering did not finish synchronously");

  return sanitizeHtml(rendered, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      code: ["class"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        target: "_blank",
        rel: "noreferrer noopener",
      }, true),
    },
  });
}
