import { mkdtemp, readFile } from "node:fs/promises";
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
    const toolNames = listed.tools.map((tool) => tool.name);
    expect(toolNames.sort()).toEqual([...CORE_MCP_TOOL_NAMES].sort());
    expect(toolNames).toHaveLength(13);
    for (const oauthTool of OFFICIAL_OPENACCOUNT_OAUTH_TOOL_NAMES) {
      expect(toolNames).not.toContain(oauthTool);
    }

    const result = await client.callTool({ name: "safety_status", arguments: {} });
    expect(result.isError).not.toBe(true);
    const safety = JSON.parse(toolText(result)) as {
      limitations: { approvalAuthenticatesHuman: boolean; assetHashIncludesFileBytes: boolean; officialOpenAccountOAuthEnabled: boolean };
      officialOpenAccountOAuth: { enabled: boolean; publishesNotes: boolean; toolsExposed: boolean };
    };
    expect(toolText(result)).toContain("不要求或返回小红书 Cookie");
    expect(safety.limitations.approvalAuthenticatesHuman).toBe(false);
    expect(safety.limitations.assetHashIncludesFileBytes).toBe(true);
    expect(safety.limitations.officialOpenAccountOAuthEnabled).toBe(false);
    expect(safety.officialOpenAccountOAuth.enabled).toBe(false);
    expect(safety.officialOpenAccountOAuth.toolsExposed).toBe(false);
    expect(safety.officialOpenAccountOAuth.publishesNotes).toBe(false);
    expect(toolText(result)).toContain("模型也可以调用 approve_draft");
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
    const approvedPayload = JSON.parse(toolText(approved)) as { approvalAuthenticatesHuman: boolean };
    expect(toolText(approved)).toContain("approved");
    expect(approvedPayload.approvalAuthenticatesHuman).toBe(false);
    expect(toolText(approved)).toContain("不能验证调用者是人类");
  });

  it("gets, updates, and cancels drafts with hash recompute and audit metadata only", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "rednote-lifecycle-"));
    client = new Client({ name: "lifecycle-test", version: "1.0.0" });
    await client.connect(new StdioClientTransport({
      command: process.execPath,
      args: [resolve("dist/cli.js")],
      env: { ...process.env, REDNOTE_DATA_DIR: dataDir } as Record<string, string>,
      stderr: "pipe",
    }));

    const saved = await client.callTool({
      name: "save_draft",
      arguments: { title: "生命周期标题", body: "SECRET_DRAFT_BODY", topics: ["测试"], assetPaths: [] },
    });
    const savedPayload = JSON.parse((saved.content as Array<{ type: string; text: string }>)[0]!.text) as {
      draft: { id: string; contentHash: string; status: string };
    };
    const draftId = savedPayload.draft.id;

    const fetched = await client.callTool({ name: "get_draft", arguments: { draftId } });
    expect(fetched.isError).not.toBe(true);
    const fetchedPayload = JSON.parse((fetched.content as Array<{ type: string; text: string }>)[0]!.text) as {
      draft: { id: string; body: string };
      approvalAuthenticatesHuman: boolean;
    };
    expect(fetchedPayload.draft.id).toBe(draftId);
    expect(fetchedPayload.draft.body).toBe("SECRET_DRAFT_BODY");
    expect(fetchedPayload.approvalAuthenticatesHuman).toBe(false);

    const missing = await client.callTool({
      name: "get_draft",
      arguments: { draftId: "00000000-0000-4000-8000-000000000000" },
    });
    expect(missing.isError).toBe(true);

    await client.callTool({ name: "submit_for_review", arguments: { draftId } });
    const approved = await client.callTool({
      name: "approve_draft",
      arguments: {
        draftId,
        expectedContentHash: savedPayload.draft.contentHash,
        confirmation: "I_APPROVE_PUBLICATION",
        reviewerNote: "已由测试人员审核",
      },
    });
    expect(approved.isError).not.toBe(true);

    const campaignOnly = await client.callTool({
      name: "update_draft",
      arguments: { draftId, campaign: "春季活动" },
    });
    const campaignPayload = JSON.parse((campaignOnly.content as Array<{ type: string; text: string }>)[0]!.text) as {
      draft: { status: string; campaign?: string; contentHash: string; approvedAt?: string };
      contentChanged: boolean;
      approvalReset: boolean;
    };
    expect(campaignPayload.contentChanged).toBe(false);
    expect(campaignPayload.approvalReset).toBe(false);
    expect(campaignPayload.draft.status).toBe("approved");
    expect(campaignPayload.draft.campaign).toBe("春季活动");
    expect(campaignPayload.draft.approvedAt).toBeTruthy();

    const contentUpdate = await client.callTool({
      name: "update_draft",
      arguments: { draftId, body: "修订后的正文" },
    });
    const updatedPayload = JSON.parse((contentUpdate.content as Array<{ type: string; text: string }>)[0]!.text) as {
      draft: { status: string; body: string; contentHash: string; approvedAt?: string };
      contentChanged: boolean;
      approvalReset: boolean;
    };
    expect(updatedPayload.contentChanged).toBe(true);
    expect(updatedPayload.approvalReset).toBe(true);
    expect(updatedPayload.draft.status).toBe("draft");
    expect(updatedPayload.draft.body).toBe("修订后的正文");
    expect(updatedPayload.draft.approvedAt).toBeUndefined();
    expect(updatedPayload.draft.contentHash).not.toBe(savedPayload.draft.contentHash);

    const cancelled = await client.callTool({
      name: "cancel_draft",
      arguments: { draftId, reason: "选题已过时" },
    });
    expect(cancelled.isError).not.toBe(true);
    expect(JSON.stringify(cancelled.content)).toContain("cancelled");

    const cancelledAgain = await client.callTool({
      name: "cancel_draft",
      arguments: { draftId, reason: "重复取消" },
    });
    expect(cancelledAgain.isError).toBe(true);
    const updateCancelled = await client.callTool({
      name: "update_draft",
      arguments: { draftId, title: "不该成功" },
    });
    expect(updateCancelled.isError).toBe(true);

    const audit = await readFile(join(dataDir, "audit.jsonl"), "utf8");
    expect(audit).toContain("draft.update");
    expect(audit).toContain("draft.cancel");
    expect(audit).not.toContain("SECRET_DRAFT_BODY");
    expect(audit).not.toContain("修订后的正文");
  });

  it("refuses to hash or save missing asset files", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "rednote-missing-asset-"));
    client = new Client({ name: "missing-asset-test", version: "1.0.0" });
    await client.connect(new StdioClientTransport({
      command: process.execPath,
      args: [resolve("dist/cli.js")],
      env: { ...process.env, REDNOTE_DATA_DIR: dataDir } as Record<string, string>,
      stderr: "pipe",
    }));

    const missingPath = join(dataDir, "not-on-disk.png");
    const checked = await client.callTool({
      name: "check_content",
      arguments: { title: "缺图标题", body: "缺图正文", topics: [], assetPaths: [missingPath] },
    });
    const checkedPayload = JSON.parse((checked.content as Array<{ type: string; text: string }>)[0]!.text) as {
      contentHash: string | null;
      hashComputed: boolean;
      checks: Array<{ code: string }>;
    };
    expect(checkedPayload.hashComputed).toBe(false);
    expect(checkedPayload.contentHash).toBeNull();
    expect(checkedPayload.checks.map((item) => item.code)).toContain("assets.missing");

    const saved = await client.callTool({
      name: "save_draft",
      arguments: { title: "缺图标题", body: "缺图正文", topics: [], assetPaths: [missingPath] },
    });
    expect(saved.isError).toBe(true);
    expect(JSON.stringify(saved.content)).toContain("assets.missing");
    expect(JSON.stringify(saved.content)).not.toContain("invent");
  });
});
