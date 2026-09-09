import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

let child: ChildProcess | undefined;
let client: Client | undefined;

afterEach(async () => {
  await client?.close();
  child?.kill();
  child = undefined;
  client = undefined;
});

async function waitForHealth(url: string): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      if ((await fetch(url)).ok) return;
    } catch { /* server is still starting */ }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error("HTTP server did not become healthy");
}

describe("MCP HTTP transport", () => {
  it("requires auth and serves tools to an authenticated client", async () => {
    const token = "integration-token-with-more-than-32-characters";
    const port = 34000 + Math.floor(Math.random() * 1000);
    const dataDir = await mkdtemp(join(tmpdir(), "rednote-http-"));
    child = spawn(process.execPath, [resolve("dist/cli.js"), "--http"], {
      env: { ...process.env, REDNOTE_DATA_DIR: dataDir, REDNOTE_PORT: String(port), REDNOTE_MCP_TOKEN: token },
      stdio: "ignore",
    });
    await waitForHealth(`http://127.0.0.1:${port}/healthz`);

    const unauthorized = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
    });
    expect(unauthorized.status).toBe(401);
    const malformed = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${token}` }, body: "{invalid",
    });
    expect(malformed.status).toBe(400);
    expect((await fetch(`http://127.0.0.1:${port}/healthz`)).ok).toBe(true);

    client = new Client({ name: "http-integration-test", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    });
    await client.connect(transport);
    expect((await client.listTools()).tools.length).toBe(10);
  });
});
