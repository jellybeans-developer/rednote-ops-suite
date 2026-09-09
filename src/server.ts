import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AppConfig } from "./config.js";
import { checkContent, contentHash, normalizeTopics } from "./content.js";
import { JsonStore } from "./store.js";
import type { ContentDraft, DraftStatus, MetricSnapshot } from "./types.js";

const APPROVAL_PHRASE = "I_APPROVE_PUBLICATION";

function textResult(value: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    isError,
  };
}

function publicDraft(draft: ContentDraft) {
  return { ...draft, approvalInstruction: draft.status === "in_review" ? `人工核对后，使用确认短语 ${APPROVAL_PHRASE} 和当前 contentHash 批准。` : undefined };
}

function assertWritable(config: AppConfig): void {
  if (config.readOnly) throw new Error("Server is running in read-only mode");
}

export async function createRedNoteServer(config: AppConfig): Promise<McpServer> {
  const store = new JsonStore(config.dataDir);
  await store.init();

  const server = new McpServer({ name: "rednote-ops", version: "0.1.0" });

  server.registerTool(
    "safety_status",
    {
      title: "查看安全与能力边界",
      description: "说明本服务会做什么、不会做什么，以及当前是否为只读模式。不会访问小红书或修改数据。",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => textResult({
      mode: config.readOnly ? "read_only" : "read_write",
      dataDirectory: config.dataDir,
      capabilities: ["内容草稿", "内容检查", "排期", "人工审批", "发布交接包", "手工指标记录"],
      boundaries: [
        "不收集或存储小红书 Cookie、密码、短信验证码",
        "不逆向私有接口、不绕过验证码或平台风控",
        "不静默发布；每条内容都要求人工核对和显式批准",
        "当前开源版本不声称拥有小红书自动发布官方 API 权限",
      ],
    }),
  );

  server.registerTool(
    "check_content",
    {
      title: "检查小红书内容草稿",
      description: "对标题、正文、话题和素材做本地确定性预检。规则是提示而非法律意见，发布前仍须人工复核平台现行规则。",
      inputSchema: {
        title: z.string().max(200),
        body: z.string().max(20000),
        topics: z.array(z.string().max(100)).max(50).default([]),
        assetPaths: z.array(z.string().max(2048)).max(20).default([]),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ title, body, topics, assetPaths }) => textResult({
      contentHash: contentHash(title, body, topics, assetPaths),
      normalizedTopics: normalizeTopics(topics),
      checks: checkContent(title, body, topics, assetPaths),
    }),
  );

  server.registerTool(
    "save_draft",
    {
      title: "保存运营草稿",
      description: "把一条内容保存到本地工作区。仅写本地数据，不会访问或发布到小红书。",
      inputSchema: {
        title: z.string().min(1).max(200),
        body: z.string().min(1).max(20000),
        topics: z.array(z.string().max(100)).max(50).default([]),
        assetPaths: z.array(z.string().max(2048)).max(20).default([]),
        campaign: z.string().max(200).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ title, body, topics, assetPaths, campaign }) => {
      try {
        assertWritable(config);
        const normalized = normalizeTopics(topics);
        const now = new Date().toISOString();
        const draft: ContentDraft = {
          id: randomUUID(), title: title.trim(), body: body.trim(), topics: normalized,
          assetPaths: assetPaths.map((path) => resolve(path)), campaign: campaign?.trim(),
          status: "draft", contentHash: contentHash(title.trim(), body.trim(), normalized, assetPaths.map((path) => resolve(path))),
          createdAt: now, updatedAt: now,
        };
        await store.addDraft(draft);
        await store.audit("draft.create", "success", draft.id, { checkCount: checkContent(title, body, topics, assetPaths).length });
        return textResult({ draft: publicDraft(draft), checks: checkContent(title, body, topics, assetPaths) });
      } catch (error) {
        await store.audit("draft.create", "error", undefined, { message: (error as Error).message });
        return textResult({ error: (error as Error).message }, true);
      }
    },
  );

  server.registerTool(
    "list_drafts",
    {
      title: "列出运营草稿",
      description: "按状态筛选并列出本地草稿，不访问外部服务。",
      inputSchema: {
        status: z.enum(["draft", "in_review", "approved", "ready_to_publish", "published", "cancelled"]).optional(),
        limit: z.number().int().min(1).max(100).default(20),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ status, limit }) => {
      const drafts = (await store.listDrafts())
        .filter((draft) => !status || draft.status === status)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, limit)
        .map(publicDraft);
      return textResult({ count: drafts.length, drafts });
    },
  );

  server.registerTool(
    "submit_for_review",
    {
      title: "提交人工审核",
      description: "把本地草稿标为待审核，可同时安排发布时间。不会对外发布。",
      inputSchema: { draftId: z.uuid(), scheduledAt: z.iso.datetime().optional() },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ draftId, scheduledAt }) => {
      try {
        assertWritable(config);
        const draft = await store.updateDraft(draftId, (item) => {
          if (!["draft", "cancelled"].includes(item.status)) throw new Error(`Cannot submit draft in status ${item.status}`);
          item.status = "in_review";
          item.scheduledAt = scheduledAt;
        });
        await store.audit("draft.submit_review", "success", draftId, { scheduledAt });
        return textResult(publicDraft(draft));
      } catch (error) {
        await store.audit("draft.submit_review", "error", draftId, { message: (error as Error).message });
        return textResult({ error: (error as Error).message }, true);
      }
    },
  );

  server.registerTool(
    "approve_draft",
    {
      title: "人工批准草稿",
      description: "高风险操作：只有人在界面中核对完整内容后，提供当前哈希与固定确认短语才会批准。不会直接发布。",
      inputSchema: {
        draftId: z.uuid(),
        expectedContentHash: z.string().length(64),
        confirmation: z.literal(APPROVAL_PHRASE),
        reviewerNote: z.string().min(3).max(500),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ draftId, expectedContentHash, reviewerNote }) => {
      try {
        assertWritable(config);
        const draft = await store.updateDraft(draftId, (item) => {
          if (item.status !== "in_review") throw new Error(`Draft must be in_review, current status: ${item.status}`);
          if (item.contentHash !== expectedContentHash) throw new Error("Content changed or hash mismatch; review the current draft again");
          item.status = "approved";
          item.approvedAt = new Date().toISOString();
        });
        await store.audit("draft.approve", "success", draftId, { reviewerNote });
        return textResult({ draft: publicDraft(draft), next: "调用 create_publish_package 生成供人工发布或官方适配器使用的交接包。" });
      } catch (error) {
        await store.audit("draft.approve", "denied", draftId, { message: (error as Error).message });
        return textResult({ error: (error as Error).message }, true);
      }
    },
  );

  server.registerTool(
    "create_publish_package",
    {
      title: "创建发布交接包",
      description: "为已批准草稿生成结构化交接包，并标记为待发布。它不会登录或调用小红书私有接口。",
      inputSchema: { draftId: z.uuid(), expectedContentHash: z.string().length(64) },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ draftId, expectedContentHash }) => {
      try {
        assertWritable(config);
        const draft = await store.updateDraft(draftId, (item) => {
          if (item.status !== "approved") throw new Error(`Draft must be approved, current status: ${item.status}`);
          if (item.contentHash !== expectedContentHash) throw new Error("Content hash mismatch");
          item.status = "ready_to_publish";
        });
        await store.audit("publish_package.create", "success", draftId);
        return textResult({
          packageVersion: 1,
          draftId: draft.id,
          contentHash: draft.contentHash,
          content: { title: draft.title, body: draft.body, topics: draft.topics, assetPaths: draft.assetPaths },
          scheduledAt: draft.scheduledAt,
          publishMethod: "human_or_approved_official_adapter",
          warning: "请在小红书官方客户端或已获批的官方能力中完成最终发布。",
        });
      } catch (error) {
        await store.audit("publish_package.create", "error", draftId, { message: (error as Error).message });
        return textResult({ error: (error as Error).message }, true);
      }
    },
  );

  server.registerTool(
    "record_publication",
    {
      title: "记录发布结果",
      description: "人工发布后记录公开笔记 ID。只更新本地台账，不调用小红书。",
      inputSchema: { draftId: z.uuid(), externalPostId: z.string().min(3).max(300) },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ draftId, externalPostId }) => {
      try {
        assertWritable(config);
        const draft = await store.updateDraft(draftId, (item) => {
          if (item.status !== "ready_to_publish") throw new Error(`Draft must be ready_to_publish, current status: ${item.status}`);
          item.status = "published";
          item.publishedAt = new Date().toISOString();
          item.externalPostId = externalPostId.trim();
        });
        await store.audit("publication.record", "success", draftId, { externalPostId });
        return textResult(publicDraft(draft));
      } catch (error) {
        await store.audit("publication.record", "error", draftId, { message: (error as Error).message });
        return textResult({ error: (error as Error).message }, true);
      }
    },
  );

  server.registerTool(
    "record_metrics",
    {
      title: "记录运营指标",
      description: "把人工查看到的公开指标写入本地台账，不抓取页面。",
      inputSchema: {
        draftId: z.uuid(),
        views: z.number().int().min(0).optional(), likes: z.number().int().min(0).optional(),
        comments: z.number().int().min(0).optional(), saves: z.number().int().min(0).optional(), follows: z.number().int().min(0).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ draftId, ...values }) => {
      try {
        assertWritable(config);
        if (!await store.getDraft(draftId)) throw new Error(`Draft not found: ${draftId}`);
        const metric: MetricSnapshot = { id: randomUUID(), draftId, capturedAt: new Date().toISOString(), source: "manual", ...values };
        await store.addMetric(metric);
        await store.audit("metrics.record", "success", draftId);
        return textResult(metric);
      } catch (error) {
        await store.audit("metrics.record", "error", draftId, { message: (error as Error).message });
        return textResult({ error: (error as Error).message }, true);
      }
    },
  );

  server.registerTool(
    "operations_summary",
    {
      title: "获取运营概览",
      description: "汇总本地草稿状态与最近手工指标，不访问外部服务。",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const db = await store.read();
      const byStatus = db.drafts.reduce<Record<DraftStatus, number>>((acc, item) => { acc[item.status] += 1; return acc; }, {
        draft: 0, in_review: 0, approved: 0, ready_to_publish: 0, published: 0, cancelled: 0,
      });
      return textResult({ drafts: db.drafts.length, byStatus, metricSnapshots: db.metrics.length, latestMetrics: db.metrics.slice(-10).reverse() });
    },
  );

  return server;
}
