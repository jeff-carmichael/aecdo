import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpConfig, McpHub, NeedsSignIn, cleanSchema, resultText, serverTarget, splitCommand, toolName, type SignInUi } from "./mcp.js";

const SERVER = fileURLToPath(new URL("../../../test/fixtures/mcp-server.mjs", import.meta.url));

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "aecdo-mcp-"));
  const project = join(dir, "Project");
  mkdirSync(join(project, "Arch"), { recursive: true });
  return { dir, project, config: new McpConfig(join(dir, "home")) };
}

/** Signs in the way a browser would: follows the sign-in page's redirect back to aecdo. */
function browser(): SignInUi & { opened: string[] } {
  const opened: string[] = [];
  return {
    opened,
    openUrl: (url) => {
      opened.push(url);
      void fetch(url, { redirect: "manual" }).then((r) => fetch(r.headers.get("location")!));
    },
    notify: () => undefined,
  };
}

async function httpServer(): Promise<{ url: string; child: ChildProcess }> {
  const child = spawn(process.execPath, [SERVER, "http"], { stdio: ["ignore", "pipe", "inherit"] });
  const url = await new Promise<string>((res) => child.stdout.once("data", (d: Buffer) => res(d.toString().trim())));
  return { url, child };
}

test("servers in Settings are on where they're marked everywhere, and folders pick their own", async () => {
  const { project, config } = setup();
  await config.saveServer("codes", { url: "https://codes.example/mcp", everywhere: true });
  await config.saveServer("firm", { command: "node", args: ["firm.js"] });
  await assert.rejects(config.saveServer("bad/name", { url: "https://x" }), /short name/);
  await assert.rejects(config.saveServer("plain", { url: "http://codes.example/mcp" }), /https/);

  const arch = join(project, "Arch");
  const before = await config.folderServers(arch);
  assert.equal(before.folder, arch);
  assert.deepEqual(before.servers.map((s) => [s.name, s.on]), [["codes", true], ["firm", false]]);

  await config.setOn(project, "firm", true);
  const after = await config.folderServers(arch);
  assert.equal(after.folder, project, "a subfolder uses the nearest parent that picked servers");
  assert.deepEqual(after.servers.map((s) => [s.name, s.on]), [["codes", true], ["firm", true]]);

  await config.setOn(arch, "codes", false);
  assert.deepEqual((await config.folderServers(arch)).servers.filter((s) => s.on).map((s) => s.name), ["firm"]);
  assert.equal(statSync(config.path).mode & 0o777, process.platform === "win32" ? statSync(config.path).mode & 0o777 : 0o600);
});

test("a folder's .mcp.json lists servers that stay off until turned on, without anyone's keys", async () => {
  const { project, config } = setup();
  const shared = {
    mcpServers: {
      specs: { url: "https://specs.example/mcp", headers: { Authorization: "Bearer someone-elses" } },
      local: { command: "node", args: ["specs.js"], env: { KEY: "secret" } },
    },
  };
  writeFileSync(join(project, ".mcp.json"), JSON.stringify(shared));
  const found = await config.folderServers(join(project, "Arch"));
  assert.equal(found.folder, project);
  assert.equal(found.sharedFile, join(project, ".mcp.json"));
  assert.deepEqual(found.servers.map((s) => [s.name, s.source, s.on]), [["specs", "folder", false], ["local", "folder", false]]);
  assert.deepEqual(found.servers[0].config, { url: "https://specs.example/mcp" });
  assert.deepEqual(found.servers[1].config, { command: "node", args: ["specs.js"] });

  await config.setOn(project, "local", true);
  assert.equal((await config.folderServers(project)).servers.find((s) => s.name === "local")?.on, true);

  shared.mcpServers.local.args = ["something-else.js"];
  writeFileSync(join(project, ".mcp.json"), JSON.stringify(shared));
  assert.equal((await config.folderServers(project)).servers.find((s) => s.name === "local")?.on, false, "a changed definition needs turning on again");
});

test("a server started on this computer gives the assistant its tools", async () => {
  const { project, config } = setup();
  await config.saveServer("codes", { command: process.execPath, args: [SERVER, "stdio"], note: "Vancouver Building By-law", everywhere: true });
  const hub = new McpHub({ config, ui: browser(), version: "test" });
  try {
    const { tools, problems } = await hub.tools((await config.folderServers(project)).servers);
    assert.deepEqual(problems, []);
    assert.deepEqual(tools.map((t) => t.name), ["codes__search_sections", "codes__fail"]);
    const search = tools[0];
    assert.match(search.description, /"codes" tool server \(Vancouver Building By-law\)/);
    assert.equal((search.parameters as { $schema?: string }).$schema, undefined);
    const result = await search.execute("1", { query: "riser" });
    const text = (result.content[0] as { text: string }).text;
    assert.match(text, /9\.8\.4\.1: Stair risers/);
    assert.match(text, /\[Section 9\.8\.4\.1\]\(https:\/\/codes\.example\/9\.8\.4\.1\)/);
    await assert.rejects(tools[1].execute("2", {}), /offline/);
  } finally {
    hub.close();
  }
});

test("a server behind OAuth needs a sign-in, then its tools work and the sign-in is kept", async () => {
  const { project, config } = setup();
  const { url, child } = await httpServer();
  const ui = browser();
  const hub = new McpHub({ config, ui, version: "test" });
  try {
    await config.saveServer("codes", { url, everywhere: true });
    const servers = (await config.folderServers(project)).servers;
    assert.equal(await hub.signedIn(servers[0].config), false);
    const first = await hub.tools(servers);
    assert.equal(first.tools.length, 0);
    assert.match(first.problems[0], /codes needs you to sign in/);
    assert.equal(ui.opened.length, 0, "a chat never opens the browser on its own");

    assert.equal(await hub.signIn("codes", servers[0].config), "Signed in to codes.");
    assert.equal(ui.opened.length, 1);
    const authorize = new URL(ui.opened[0]);
    assert.equal(authorize.searchParams.get("resource"), url);
    assert.equal(authorize.searchParams.get("code_challenge_method"), "S256");
    assert.equal(await hub.signedIn(servers[0].config), true);
    const saved = JSON.parse(readFileSync(config.authPath, "utf-8")) as Record<string, { tokens?: object }>;
    assert.ok(saved[url].tokens);

    const fresh = new McpHub({ config, ui, version: "test" });
    try {
      const { tools, problems } = await fresh.tools(servers);
      assert.deepEqual(problems, []);
      assert.match(((await tools[0].execute("1", { query: "handrail" })).content[0] as { text: string }).text, /865 mm/);
    } finally {
      fresh.close();
    }

    await hub.signOut("codes", servers[0].config);
    assert.equal(await hub.signedIn(servers[0].config), false);
  } finally {
    hub.close();
    child.kill();
  }
});

test("helpers: tool names, schemas, results, command lines", () => {
  const used = new Set<string>();
  assert.equal(toolName("Firm standards", "look.up", used), "Firm_standards__look_up");
  assert.equal(toolName("Firm standards", "look up", used), "Firm_standards__look_up_2");
  assert.ok(toolName("x".repeat(40), "y".repeat(40), used).length <= 64);
  assert.deepEqual(cleanSchema({ type: "object" }), { type: "object", properties: {} });
  assert.equal(resultText([{ type: "image" }], undefined), "(image not shown)");
  assert.equal(resultText([], { a: 1 }), '{"a":1}');
  assert.match(resultText([{ type: "text", text: "x".repeat(50_000) }]), /cut at 40000/);
  assert.deepEqual(splitCommand(`npx -y "@acme/specs server" --dir 'C:\\My Specs'`), { command: "npx", args: ["-y", "@acme/specs server", "--dir", "C:\\My Specs"] });
  assert.deepEqual(splitCommand(serverTarget(splitCommand(`npx "a b" c`))), { command: "npx", args: ["a b", "c"] });
  assert.ok(new NeedsSignIn("codes").message.includes("Sign in"));
});
