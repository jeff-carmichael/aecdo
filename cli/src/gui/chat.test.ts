import { test } from "node:test";
import assert from "node:assert/strict";

// The app's frontend file, loaded from the source tree (dist/src/gui → repo root).
const { renderMarkdown } = (await import(new URL("../../../cli/gui/chat.js", import.meta.url).href)) as {
  renderMarkdown: (text: string, sheets: Set<string>) => string;
};

const id = "urn:uuid:3f2b8c1e-0000-4000-8000-000000000209";

test("a Markdown link to an @id becomes a source link, keeping sheet links and code", () => {
  const html = renderMarkdown(`Door [**209B** on A201](${id}) isn't in the schedule on A601. See \`[x](${id})\`.`, new Set(["A201", "A601"]));
  assert.ok(html.includes(`<a href="#" class="source-link" data-id="${id}" title="Show on the drawing"><strong>209B</strong> on A201</a>`), html);
  assert.ok(html.includes('class="sheet-link" data-sheet="A601"'), "sheet numbers outside the link still link");
  assert.ok(!html.includes('data-sheet="A201"'), "no sheet link inside a source link");
  assert.equal(html.match(/source-link/g)?.length, 2, "a link in backticks still links");
});

test("only urn ids become source links; other links and half-written ones stay text", () => {
  const sheets = new Set<string>();
  assert.ok(renderMarkdown(`[a](#${id})`, sheets).includes(`data-id="${id}"`), "a leading # is tolerated");
  assert.ok(!renderMarkdown("[a](https://example.com)", sheets).includes("source-link"));
  assert.ok(!renderMarkdown("[a](urn:uuid:3f2b", sheets).includes("source-link"), "a link still streaming in isn't linked yet");
  assert.ok(!renderMarkdown('[a](urn:x"><img src=x onerror=alert(1)>)', sheets).includes("<img"), "escaped before linking");
});
