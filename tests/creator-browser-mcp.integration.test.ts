import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CORE_MCP_TOOL_NAMES, CREATOR_BROWSER_TOOL_NAMES } from "../src/mcp-tool-names.js";

let client: Client | undefined;
afterEach(async () => { await client?.close(); client = undefined; });

describe("creator browser MCP gating", () => {
  it("exposes browser tools only when enabled and denies publish by default without launching Chrome", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "rednote-creator-mcp-"));
    client = new Client({ name: "creator-browser-test", version: "1.0.0" });
    await client.connect(new StdioClientTransport({
      command: process.execPath,
      args: [resolve("dist/cli.js")],
      env: { ...process.env, REDNOTE_DATA_DIR: dataDir, REDNOTE_CREATOR_BROWSER_ENABLED: "true" } as Record<string, string>,
      stderr: "pipe",
    }));
    const names = (await client.listTools()).tools.map((tool) => tool.name);
    expect(names).toEqual(expect.arrayContaining([...CORE_MCP_TOOL_NAMES, ...CREATOR_BROWSER_TOOL_NAMES]));
    expect(names).toHaveLength(CORE_MCP_TOOL_NAMES.length + CREATOR_BROWSER_TOOL_NAMES.length);
    const denied = await client.callTool({
      name: "publish_creator_draft",
      arguments: { draftId: "00000000-0000-4000-8000-000000000000", expectedContentHash: "0".repeat(64), confirmation: "PUBLISH_TO_XIAOHONGSHU" },
    });
    expect(denied.isError).toBe(true);
    expect(JSON.stringify(denied.content)).toContain("默认关闭");
  });
});
