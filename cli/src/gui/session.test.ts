import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GuiSession, type ChatBridge, type BridgeHooks, type GuiEvent } from "./session.js";
import type { AssistantOutput, Mention } from "../commands/explore.js";
import type { DrawingSet } from "../types.js";

const examples = new URL("../../../examples/", import.meta.url);
const read = (url: URL) => JSON.parse(readFileSync(url, "utf-8")) as DrawingSet;
const maple = read(new URL("../../../test/fixtures/maple-grove-library.jsonld", import.meta.url));
const house = read(new URL("sample-drawing-package-1and2family.jsonld", examples));

function session(data = maple, file = "/work/maple-grove-library.jsonld", bridge?: (out: AssistantOutput, hooks: BridgeHooks) => ChatBridge) {
  const events: GuiEvent[] = [];
  const s = new GuiSession(data, file, { emit: (e) => events.push(e), confirm: () => Promise.resolve(true), bridge });
  return { s, events };
}

test("boot lists every sheet and says when the PDF is missing", async () => {
  const { s } = session();
  const boot = await s.boot();
  assert.equal(boot.sheets.length, maple.sheets.length);
  assert.deepEqual(boot.sheets[0], { n: "G001", t: "Cover Sheet", p: 0 });
  assert.equal(boot.groups, undefined, "19 sheets are listed flat");
  assert.equal(boot.pdf.available, false);
  assert.ok(boot.pdf.missing?.some((l) => l.includes("Can't find the source PDF")));
  assert.ok(!boot.pdf.missing?.some((l) => /view/.test(l)), "no typed-command advice");
  assert.equal(boot.state.kind, "sheets");
});

test("moving around returns the place with breadcrumbs and where each row is on the page", () => {
  const { s } = session();
  const sheet = s.openSheet("A101");
  assert.equal(sheet.kind, "sheet");
  assert.equal(sheet.sheet?.sheetNumber, "A101");
  assert.deepEqual(sheet.crumbs.map((c) => c.label), ["Sheets", "A101"]);
  const firstRow = sheet.sections[0].rows[0];
  assert.equal(firstRow.command, "1");
  assert.equal(firstRow.box?.pageIndex, sheet.sheet?.pageIndex);
  assert.equal(firstRow.box?.bbox.length, 4);

  const item = s.command(["1", "1", "1"]);
  assert.equal(item.kind, "item");
  assert.ok(item.fields && item.fields.length > 0);
  assert.ok(item.target?.bbox, "the item is outlined");
  assert.deepEqual(item.crumbs.at(-2)?.commands, ["up"]);
  assert.deepEqual(item.crumbs[1].commands, ["up", "up", "up"]);

  const back = s.command(["back"]);
  assert.equal(back.kind, "layer");
  assert.ok(back.seq > sheet.seq, "each move bumps seq");
});

test("a command that goes nowhere says why", () => {
  const { s } = session();
  s.openSheet("A101");
  const r = s.command(["99"]);
  assert.equal(r.kind, "sheet");
  assert.match(r.message ?? "", /No entry "99"/);
});

test("following a link says how to come back, and openId opens anything by its @id", () => {
  const { s } = session();
  const withRef = maple.sheets.flatMap((sh) => (sh.drawings ?? []).map((d) => ({ sh, d }))).find(({ d }) => d.references?.length);
  assert.ok(withRef, "the demo set has a drawing with references");
  s.openSheet(withRef.sh.sheetNumber);
  const i = withRef.sh.drawings!.indexOf(withRef.d) + 1;
  s.command([String(i)]);
  const jumped = s.command(["r1"]);
  assert.match(jumped.message ?? "", /Press ← to come back/);

  const door = maple.sheets.find((sh) => sh.sheetNumber === "A601")!;
  const table = door.tables![0];
  const opened = s.openId(table["@id"]);
  assert.equal(opened.kind, "entry");
  assert.ok(opened.table && opened.table.length > 1, "tables come as rows");
  assert.match(s.openId("urn:uuid:nope").message ?? "", /Nothing with id/);
});

test("preview shows a sheet without moving, and find matches sheet numbers and title words", () => {
  const { s } = session();
  const p = s.preview("A601");
  assert.equal(p?.kind, "preview");
  assert.equal(p?.sheet?.sheetNumber, "A601");
  assert.equal(s.state().kind, "sheets", "previewing doesn't move");
  assert.deepEqual(s.find("a6"), ["A601"]);
  assert.ok(s.find("door").includes("A601"));
  assert.equal(s.preview("nope"), undefined);
});

test("big sets come in groups", async () => {
  const sheets = Array.from({ length: 40 }, (_, i) => ({ ...maple.sheets[i % maple.sheets.length], sheetNumber: `${i % 2 ? "A" : "S"}${100 + i}`, pageIndex: i }));
  const { s } = session({ ...maple, sheets });
  const boot = await s.boot();
  assert.deepEqual(boot.groups?.map((g) => g.prefix), ["S", "A"], "in the order they first appear");
  assert.equal(boot.sheets.filter((x) => x.g === 0).length, 20);
});

test("markups: added from the selection go straight into a copy the pane shows", async () => {
  const dir = mkdtempSync(join(tmpdir(), "aecdo-gui-"));
  copyFileSync(new URL("sample-drawing-package-1and2family.pdf", examples), join(dir, "sample-drawing-package-1and2family.pdf"));
  const { s, events } = session(house, join(dir, "sample-drawing-package-1and2family.jsonld"));
  const before = await s.pdfInfo();
  assert.equal(before.available, true);
  s.openSheet("2");
  s.command(["1", "1", "1"]);
  assert.match(await s.addMarkup({ kind: "cloud", text: "Check egress window" }), /^Added cloud/);
  assert.ok(events.some((e) => e.type === "markups"));
  assert.ok(events.some((e) => e.type === "pdf"), "the pane reloads");
  const after = await s.pdfInfo();
  assert.equal(after.savedCopy, true);
  assert.ok(after.version > before.version);
  assert.match(s.pdfFile() ?? "", /-markups\.pdf$/);

  const info = await s.markupsInfo();
  assert.equal(info.file, "sample-drawing-package-1and2family-markups.pdf");
  assert.equal(info.markups.length, 1);
  assert.equal(info.markups[0].sheetNumber, "2");
  assert.match(info.markups[0].describe, /Check egress window/);

  assert.match(await s.markupsAction("delete", 1), /^Deleted cloud 2/);
  assert.equal((await s.markupsInfo()).markups.length, 0);
  assert.equal(await s.markupsAction("undo"), "Undone.");
  assert.equal((await s.markupsInfo()).markups.length, 1);
  await assert.rejects(s.markupsAction("explode"), /Unknown markups action/);
});

test("picking another PDF", async () => {
  const dir = mkdtempSync(join(tmpdir(), "aecdo-gui-"));
  copyFileSync(new URL("sample-drawing-package-1and2family.pdf", examples), join(dir, "plans.pdf"));
  const { s } = session(house, join(dir, "set.jsonld"));
  const before = await s.pdfInfo();
  assert.equal(before.available, false);
  assert.deepEqual(before.choices, ["plans.pdf"]);
  const after = await s.setPdf("plans.pdf");
  assert.equal(after.available, true);
  assert.ok(after.version > before.version);
  await assert.rejects(s.setPdf("missing.pdf"), /Can't find/);
});

/** Stands in for the assistant: echoes the question, moves the view, and shows the page. */
function fakeBridge(out: AssistantOutput, hooks: BridgeHooks): ChatBridge {
  return {
    active: undefined,
    setUp: () => Promise.resolve(["chatgpt", "claude"]),
    describe: (name) => Promise.resolve({ label: name === "claude" ? "Claude" : "ChatGPT", detail: `${name}-model via test`, others: [] }),
    run: async (m: Mention) => {
      hooks.onTool("navigate", { command: "A101" });
      hooks.onNavigate();
      out.write(`(${m.assistant?.name}) `);
      out.write(`you asked: ${m.text}`);
      out.print("  done");
      const shown = await hooks.showPage();
      out.print(shown);
      if (!(await out.confirm("Allow the assistant to edit notes.md? [y/N] "))) out.print("declined");
    },
  };
}

test("chat threads are separate conversations that start with the first model set up", async () => {
  const { s, events } = session(maple, "/work/maple-grove-library.jsonld", fakeBridge);
  const a = await s.newThread();
  assert.equal(a.model, "chatgpt");
  const b = await s.newThread("claude");
  assert.notEqual(a.id, b.id);

  await s.send(a.id, "what is on this sheet?");
  const [ta, tb] = s.threadList();
  assert.equal(ta.title, "what is on this sheet?");
  assert.deepEqual(
    ta.entries.map((e) => e.role),
    ["user", "tool", "assistant", "status", "status"]
  );
  assert.equal(ta.entries[2].text, "(chatgpt) you asked: what is on this sheet?");
  assert.equal(ta.entries[3].text, "done");
  assert.match(ta.entries[4].text, /Open a sheet first/);
  assert.equal(tb.entries.length, 0, "the other chat is untouched");
  assert.ok(events.some((e) => e.type === "state"), "the assistant's moves update the app");
  assert.ok(events.some((e) => e.type === "chat" && e.op === "thread" && !e.info.busy));

  await s.send(b.id, "@chatgpt");
  assert.equal(s.threadList()[1].model, "chatgpt");
  assert.match(s.threadList()[1].entries[0].text, /now go to ChatGPT/);

  s.closeThread(a.id);
  assert.deepEqual(s.threadList().map((t) => t.id), [b.id]);
  await assert.rejects(s.send("t99", "hi"), /No chat/);
});

test("show_page in the app zooms the PDF pane instead of opening a viewer", async () => {
  const dir = mkdtempSync(join(tmpdir(), "aecdo-gui-"));
  copyFileSync(new URL("sample-drawing-package-1and2family.pdf", examples), join(dir, "sample-drawing-package-1and2family.pdf"));
  let hooks: BridgeHooks | undefined;
  const { s, events } = session(house, join(dir, "sample-drawing-package-1and2family.jsonld"), (out, h) => {
    hooks = h;
    return fakeBridge(out, h);
  });
  await s.newThread();
  s.openSheet("2");
  s.command(["1"]);
  const shown = await hooks!.showPage();
  assert.match(shown, /zoomed to drawing Upper Floor Plan outlined in red, in the PDF pane/);
  assert.ok(events.some((e) => e.type === "focus"));
});
