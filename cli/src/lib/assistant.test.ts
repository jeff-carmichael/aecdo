import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createModels, fauxProvider, fauxAssistantMessage, fauxToolCall, fauxText, Type } from "@earendil-works/pi-ai";
import { Explorer, PageViewer } from "../commands/explore.js";
import { buildTools, createAssistantSession, resolveInCwd, wrapPrompt, type AssistantHost } from "./assistant.js";
import { ASSISTANTS } from "./llm.js";
import type { DrawingSet } from "../types.js";

const data = JSON.parse(
  readFileSync(new URL("../../../examples/sample-drawing-set.jsonld", import.meta.url), "utf-8")
) as DrawingSet;

function setup(confirm = true) {
  const cwd = mkdtempSync(join(tmpdir(), "aecdo-assistant-"));
  const screen: string[] = [];
  const explorer = new Explorer(data, (l = "") => screen.push(l));
  const out: string[] = [];
  const host: AssistantHost = {
    data,
    filePath: join(cwd, "set.jsonld"),
    cwd,
    view: explorer,
    write: (t) => out.push(t),
    print: (l) => out.push(l + "\n"),
    confirm: () => Promise.resolve(confirm),
  };
  const faux = fauxProvider({ tokensPerSecond: 100_000 });
  const models = createModels();
  models.setProvider(faux.provider);
  return { cwd, explorer, host, faux, models, out, screen };
}

function lastUserText(context: { messages: { role: string; content: unknown }[] }): string {
  const user = context.messages.filter((m) => m.role === "user").at(-1);
  if (!user) return "";
  if (typeof user.content === "string") return user.content;
  return (user.content as { type: string; text?: string }[]).map((c) => c.text ?? "").join("");
}

test("wraps prompts with the current explore view", () => {
  const { explorer } = setup();
  explorer.handle("A101");
  const prompt = wrapPrompt(explorer, "what is here?");
  assert.match(prompt, /^<current_view>/);
  assert.match(prompt, /"view": "sheet"/);
  assert.match(prompt, /"location": "A101"/);
  assert.match(prompt, /what is here\?$/);
});

test("the assistant can navigate, take notes and fill a spreadsheet", async () => {
  const { cwd, explorer, host, faux, models, out, screen } = setup();
  writeFileSync(join(cwd, "takeoff.csv"), "Sheet,Drawings\n");
  let firstPrompt = "";

  faux.setResponses([
    (context) => {
      firstPrompt = lastUserText(context);
      return fauxAssistantMessage(
        [
          fauxToolCall("navigate", { command: "A101" }),
          fauxToolCall("append_note", { text: "- A101 has one drawing" }),
          fauxToolCall("append_rows", { file: "takeoff.csv", rows: [["A101", 1]] }),
        ],
        { stopReason: "toolUse" }
      );
    },
    fauxAssistantMessage([fauxText("Done: noted A101 and added it to takeoff.csv.")]),
  ]);

  const session = await createAssistantSession(host, ASSISTANTS.claude, models, faux.getModel());
  await session.ask("note what is on A101");

  assert.match(firstPrompt, /"view": "sheet list"/);
  assert.equal(explorer.view.kind, "sheet");
  assert.ok(screen.some((l) => l.includes("Sheet A101")), "user sees the navigation");
  assert.equal(readFileSync(join(cwd, "notes.md"), "utf-8"), "- A101 has one drawing\n");
  assert.equal(readFileSync(join(cwd, "takeoff.csv"), "utf-8"), "Sheet,Drawings\nA101,1\n");
  const printed = out.join("");
  assert.match(printed, /Added a note to notes\.md/);
  assert.match(printed, /Done: noted A101/);
});

test("spreadsheet edits stop when the user declines", async () => {
  const { cwd, host, faux, models, out } = setup(false);
  writeFileSync(join(cwd, "takeoff.csv"), "Sheet\n");
  faux.setResponses([
    fauxAssistantMessage([fauxToolCall("append_rows", { file: "takeoff.csv", rows: [["A101"]] })], { stopReason: "toolUse" }),
    fauxAssistantMessage([fauxText("OK, I left it alone.")]),
  ]);
  const session = await createAssistantSession(host, ASSISTANTS.chatgpt, models, faux.getModel());
  await session.ask("add A101");
  assert.equal(readFileSync(join(cwd, "takeoff.csv"), "utf-8"), "Sheet\n");
  assert.match(out.join(""), /declined edits/);
});

test("file tools stay inside the current folder", () => {
  assert.throws(() => resolveInCwd("/work", "../secrets.md", [".md"]), /outside the current folder/);
  assert.throws(() => resolveInCwd("/work", "/etc/passwd.md", [".md"]), /outside the current folder/);
  assert.throws(() => resolveInCwd("/work", "set.jsonld", [".md"]), /must end in/);
  assert.equal(resolveInCwd("/work", "sub/notes.md", [".md"]), "/work/sub/notes.md");
});

test("the assistant can open the page view with the item outlined", async () => {
  const { explorer, host, faux, models } = setup();
  const opened: string[] = [];
  const bboxes: unknown[] = [];
  const viewer = new PageViewer(data, host.filePath, undefined, {
    log: () => undefined,
    exists: () => true,
    open: (p) => opened.push(p),
    render: (req) => {
      bboxes.push(req.bbox);
      return Promise.resolve({ path: "/tmp/A101.png", pdfPath: "/tmp/A101.pdf", pageCount: 2 });
    },
  });
  host.showPage = async () => (await viewer.show(explorer)).join("\n");
  let toolResult = "";

  faux.setResponses([
    fauxAssistantMessage(
      [
        fauxToolCall("navigate", { command: "A101" }),
        fauxToolCall("navigate", { command: "1" }),
        fauxToolCall("navigate", { command: "1" }),
        fauxToolCall("navigate", { command: "1" }),
        fauxToolCall("show_page", {}),
      ],
      { stopReason: "toolUse" }
    ),
    (context) => {
      const last = context.messages.at(-1) as { content: { text?: string }[] };
      toolResult = last.content.map((c) => c.text ?? "").join("");
      return fauxAssistantMessage([fauxText("Opened it.")]);
    },
  ]);

  const session = await createAssistantSession(host, ASSISTANTS.claude, models, faux.getModel());
  await session.ask("show me the exterior wall");
  assert.deepEqual(bboxes, [[85, 120, 700, 130]]);
  assert.deepEqual(opened, ["/tmp/A101.png"]);
  assert.match(toolResult, /with item Exterior Wall in red/);
});

test("show_page is only offered when the host supports it", () => {
  const { host } = setup();
  const names = (h: AssistantHost) => buildTools(h, Type).map((t) => t.name);
  assert.ok(!names(host).includes("show_page"));
  assert.ok(names({ ...host, showPage: () => Promise.resolve("") }).includes("show_page"));
});
