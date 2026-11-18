// A tiny MCP tool server for tests, with no dependencies.
//   node mcp-server.mjs stdio        JSON-RPC over stdin/stdout
//   node mcp-server.mjs http         Streamable HTTP on a free port behind OAuth (prints its URL);
//                                    its authorization server approves every sign-in at once.
import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { createInterface } from "node:readline";

const SECTIONS = {
  "9.8.4.1": "Stair risers: max 200 mm, min 125 mm (private stairs).",
  "9.8.7.4": "Handrail height: 865 mm to 965 mm.",
};

const TOOLS = [
  {
    name: "search_sections",
    description: "Search building code sections by keyword.",
    inputSchema: { $schema: "https://json-schema.org/draft/2020-12/schema", type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
  { name: "fail", description: "Always fails.", inputSchema: { type: "object" } },
];

function call(name, args) {
  if (name === "fail") return { isError: true, content: [{ type: "text", text: "The code library is offline." }] };
  const q = String(args?.query ?? "").toLowerCase();
  const hits = Object.entries(SECTIONS).filter(([, t]) => t.toLowerCase().includes(q));
  return {
    content: [
      { type: "text", text: hits.map(([s, t]) => `${s}: ${t}`).join("\n") || "no match" },
      ...hits.map(([s]) => ({ type: "resource_link", uri: `https://codes.example/${s}`, name: `Section ${s}` })),
    ],
  };
}

/** The answer to one JSON-RPC message, or undefined for a notification. */
function handle(msg) {
  if (msg.id === undefined) return undefined;
  const reply = (result) => ({ jsonrpc: "2.0", id: msg.id, result });
  switch (msg.method) {
    case "initialize":
      return reply({ protocolVersion: msg.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "codes", version: "1.0.0" } });
    case "tools/list":
      return reply({ tools: TOOLS });
    case "tools/call":
      return reply(call(msg.params.name, msg.params.arguments));
    case "ping":
      return reply({});
    default:
      return { jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `Unknown method ${msg.method}` } };
  }
}

if (process.argv[2] === "stdio") {
  createInterface({ input: process.stdin }).on("line", (line) => {
    if (!line.trim()) return;
    const out = handle(JSON.parse(line));
    if (out) process.stdout.write(JSON.stringify(out) + "\n");
  });
} else {
  const codes = new Map();
  const tokens = new Set();
  let base = "";
  const json = (res, status, body) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, base);
    let body = "";
    for await (const c of req) body += c;
    if (url.pathname.startsWith("/.well-known/oauth-protected-resource")) {
      return json(res, 200, { resource: `${base}/mcp`, authorization_servers: [base] });
    }
    if (url.pathname === "/.well-known/oauth-authorization-server") {
      return json(res, 200, {
        issuer: base,
        authorization_endpoint: `${base}/authorize`,
        token_endpoint: `${base}/token`,
        registration_endpoint: `${base}/register`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none"],
      });
    }
    if (url.pathname === "/register") return json(res, 201, { ...JSON.parse(body), client_id: randomUUID() });
    if (url.pathname === "/authorize") {
      const code = randomUUID();
      codes.set(code, url.searchParams.get("code_challenge"));
      const to = new URL(url.searchParams.get("redirect_uri"));
      to.searchParams.set("code", code);
      to.searchParams.set("state", url.searchParams.get("state") ?? "");
      to.searchParams.set("iss", base);
      res.writeHead(302, { location: to.href });
      return res.end();
    }
    if (url.pathname === "/token") {
      const form = new URLSearchParams(body);
      if (form.get("grant_type") === "authorization_code") {
        const challenge = codes.get(form.get("code"));
        if (!challenge || createHash("sha256").update(form.get("code_verifier") ?? "").digest("base64url") !== challenge) return json(res, 400, { error: "invalid_grant" });
      }
      const token = randomUUID();
      tokens.add(token);
      return json(res, 200, { access_token: token, token_type: "Bearer", expires_in: 3600, refresh_token: randomUUID() });
    }
    if (url.pathname === "/mcp") {
      if (!tokens.has((req.headers.authorization ?? "").replace(/^Bearer /, ""))) {
        res.writeHead(401, { "www-authenticate": `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"` });
        return res.end();
      }
      if (req.method !== "POST") {
        res.writeHead(405);
        return res.end();
      }
      const out = handle(JSON.parse(body));
      if (!out) {
        res.writeHead(202);
        return res.end();
      }
      return json(res, 200, out);
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(0, "127.0.0.1", () => {
    base = `http://127.0.0.1:${server.address().port}`;
    process.stdout.write(`${base}/mcp\n`);
  });
}
