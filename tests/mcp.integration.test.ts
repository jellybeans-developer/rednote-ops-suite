import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

let client: Client | undefined;

afterEach(async () => {
  await client?.close();
  client = undefined;
});

describe("MCP stdio transport", () => {
  it("connects, lists the safe tool set, and calls safety_status", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "rednote-mcp-"));
    client = new Client({ name: "integration-test", version: "1.0.0" });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [resolve("dist/cli.js")],
      env: { ...process.env, REDNOTE_DATA_DIR: dataDir } as Record<string, string>,
      stderr: "pipe",
    });
    await client.connect(transport);

    const listed = await client.listTools();
    expect(listed.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      "safety_status", "save_draft", "approve_draft", "create_publish_package", "operations_summary",
    ]));

    const result = await client.callTool({ name: "safety_status", arguments: {} });
    expect(result.isError).not.toBe(true);
    expect(JSON.stringify(result.content)).toContain("不收集或存储小红书 Cookie");
  });

  it("rejects approval when the reviewed content hash does not match", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "rednote-approval-"));
    client = new Client({ name: "approval-test", version: "1.0.0" });
    await client.connect(new StdioClientTransport({
      command: process.execPath,
      args: [resolve("dist/cli.js")],
      env: { ...process.env, REDNOTE_DATA_DIR: dataDir } as Record<string, string>,
      stderr: "pipe",
    }));

    const saved = await client.callTool({
      name: "save_draft",
      arguments: { title: "测试标题", body: "这是一篇测试正文", topics: ["测试"], assetPaths: [] },
    });
    const savedText = (saved.content as Array<{ type: string; text: string }>)[0]!.text;
    const draft = JSON.parse(savedText).draft as { id: string; contentHash: string };
    await client.callTool({ name: "submit_for_review", arguments: { draftId: draft.id } });

    const denied = await client.callTool({
      name: "approve_draft",
      arguments: {
        draftId: draft.id,
        expectedContentHash: "0".repeat(64),
        confirmation: "I_APPROVE_PUBLICATION",
        reviewerNote: "已由测试人员审核",
      },
    });
    expect(denied.isError).toBe(true);
    expect(JSON.stringify(denied.content)).toContain("hash mismatch");

    const approved = await client.callTool({
      name: "approve_draft",
      arguments: {
        draftId: draft.id,
        expectedContentHash: draft.contentHash,
        confirmation: "I_APPROVE_PUBLICATION",
        reviewerNote: "已由测试人员审核",
      },
    });
    expect(approved.isError).not.toBe(true);
    expect(JSON.stringify(approved.content)).toContain("approved");
  });
});
