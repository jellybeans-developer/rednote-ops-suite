import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CORE_MCP_TOOL_NAMES, OFFICIAL_OPENACCOUNT_OAUTH_TOOL_NAMES } from "../src/mcp-tool-names.js";

let client: Client | undefined;

afterEach(async () => {
  await client?.close();
  client = undefined;
});

function toolText(result: { content: unknown }): string {
  return (result.content as Array<{ type: string; text: string }>)[0]!.text;
}

describe("official OAuth MCP tools are gated", () => {
  it("exposes OAuth tools only when explicitly enabled with credentials", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "rednote-oauth-mcp-"));
    client = new Client({ name: "oauth-mcp-test", version: "1.0.0" });
    await client.connect(new StdioClientTransport({
      command: process.execPath,
      args: [resolve("dist/cli.js")],
      env: {
        ...process.env,
        REDNOTE_DATA_DIR: dataDir,
        REDNOTE_OPENACCOUNT_OAUTH_ENABLED: "true",
        REDNOTE_OPENACCOUNT_APP_ID: "xhs_test_app",
        REDNOTE_OPENACCOUNT_APP_SECRET: "sk_test_secret",
      } as Record<string, string>,
      stderr: "pipe",
    }));

    const toolNames = (await client.listTools()).tools.map((tool) => tool.name);
    expect(toolNames).toEqual(expect.arrayContaining([...CORE_MCP_TOOL_NAMES]));
    expect(toolNames).toEqual(expect.arrayContaining([...OFFICIAL_OPENACCOUNT_OAUTH_TOOL_NAMES]));
    expect(toolNames).toHaveLength(CORE_MCP_TOOL_NAMES.length + OFFICIAL_OPENACCOUNT_OAUTH_TOOL_NAMES.length);

    const safety = JSON.parse(toolText(await client.callTool({ name: "safety_status", arguments: {} }))) as {
      officialOpenAccountOAuth: { enabled: boolean; publishesNotes: boolean; toolsExposed: boolean };
      limitations: { officialOpenAccountOAuthPublishesNotes: boolean };
    };
    expect(safety.officialOpenAccountOAuth.enabled).toBe(true);
    expect(safety.officialOpenAccountOAuth.toolsExposed).toBe(true);
    expect(safety.officialOpenAccountOAuth.publishesNotes).toBe(false);
    expect(safety.limitations.officialOpenAccountOAuthPublishesNotes).toBe(false);
    expect(toolText(await client.callTool({ name: "safety_status", arguments: {} }))).toContain("不是通用第三方发笔记 API");
  });
});
