import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AppConfig } from "./config.js";
import { AssetAccessError, checkContent, contentHash, contentHashForAssetPaths, inspectAssetFiles, normalizeTopics } from "./content.js";
import {
  CORE_MCP_TOOL_NAMES,
  OFFICIAL_OPENACCOUNT_OAUTH_TOOL_NAMES,
  PACKAGE_VERSION,
} from "./mcp-tool-names.js";
import {
  createOfficialOpenAccountFetchClient,
  OfficialOpenAccountOAuthAdapter,
  type OfficialOpenAccountHttpClient,
} from "./openaccount/oauth-adapter.js";
import { registerOfficialOpenAccountOauthTools } from "./openaccount/mcp-tools.js";
import { OfficialOauthTokenStore } from "./openaccount/token-store.js";
import { JsonStore } from "./store.js";
import type { ContentDraft, DraftStatus, MetricSnapshot } from "./types.js";

export interface CreateRedNoteServerOptions {
  openAccountHttpClient?: OfficialOpenAccountHttpClient;
}

const APPROVAL_PHRASE = "I_APPROVE_PUBLICATION";
const APPROVAL_HUMAN_AUTH_LIMITATION =
  "确认短语与 contentHash 只能把批准绑定到这份内容，不能验证调用者是人类。模型也可以调用 approve_draft。不要把它当作独立的真人授权边界。最终发布必须由人在官方客户端完成。";

const UNPUBLISHED_MUTABLE_STATUSES: DraftStatus[] = ["draft", "in_review", "approved", "ready_to_publish"];
const APPROVAL_RESET_STATUSES: DraftStatus[] = ["in_review", "approved", "ready_to_publish"];

function textResult(value: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    isError,
  };
}

function errorResult(error: unknown) {
  const message = (error as Error).message;
  if (error instanceof AssetAccessError) {
    return textResult({ error: message, code: `assets.${error.reason}`, assetPath: error.assetPath }, true);
  }
  return textResult({ error: message }, true);
}

function publicDraft(draft: ContentDraft) {
  return {
    ...draft,
    approvalInstruction: draft.status === "in_review"
      ? `人工核对后，使用确认短语 ${APPROVAL_PHRASE} 和当前 contentHash 批准。${APPROVAL_HUMAN_AUTH_LIMITATION}`
      : undefined,
    approvalAuthenticatesHuman: false,
  };
}

function assertWritable(config: AppConfig): void {
  if (config.readOnly) throw new Error("Server is running in read-only mode");
}

export async function createRedNoteServer(
  config: AppConfig,
  options: CreateRedNoteServerOptions = {},
): Promise<McpServer> {
  const store = new JsonStore(config.dataDir);
  await store.init();

  const server = new McpServer({ name: "rednote-ops", version: PACKAGE_VERSION });

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
      capabilities: ["内容草稿", "内容检查", "草稿读取/更新/取消", "排期", "人工审批（非身份认证）", "发布交接包", "手工指标记录"],
      coreToolNames: CORE_MCP_TOOL_NAMES,
      boundaries: [
        "不收集或存储小红书 Cookie、密码、短信验证码",
        "不逆向私有接口、不绕过验证码或平台风控",
        "不静默发布；每条内容都要求显式批准后，由人在官方客户端完成发布",
        "当前开源版本不声称拥有小红书自动发布官方 API 权限",
        "官方 openaccount 文档公开的是 OAuth 与 min_user_info 等账号能力，不是通用第三方发笔记 API",
        APPROVAL_HUMAN_AUTH_LIMITATION,
      ],
      limitations: {
        approvalAuthenticatesHuman: false,
        liveXiaohongshuConnection: false,
        unofficialPublishingAdapter: false,
        officialOpenAccountOAuthEnabled: config.openAccountOAuth.enabled,
        officialOpenAccountOAuthPublishesNotes: false,
        assetHashIncludesFileBytes: true,
        missingAssetsFailClosed: true,
      },
      officialOpenAccountOAuth: {
        enabled: config.openAccountOAuth.enabled,
        toolsExposed: config.openAccountOAuth.enabled,
        toolNamesWhenEnabled: OFFICIAL_OPENACCOUNT_OAUTH_TOOL_NAMES,
        documentedOfficialCapabilities: ["device grant", "token refresh", "min_user_info"],
        publishesNotes: false,
        registeringOfficialAppIsUserResponsibility: true,
        oauthIsNotPublishPermission: true,
      },
      approval: {
        phrase: APPROVAL_PHRASE,
        bindsToContentHash: true,
        authenticatesHuman: false,
        warning: APPROVAL_HUMAN_AUTH_LIMITATION,
      },
      hashing: {
        includesTitleBodyTopics: true,
        includesAssetFileBytes: true,
        missingAssetBehavior: "fail_closed_without_inventing_bytes",
      },
    }),
  );

  server.registerTool(
    "check_content",
    {
      title: "检查小红书内容草稿",
      description: "对标题、正文、话题和素材做本地确定性预检。素材路径存在时会读取文件字节计入 contentHash；缺失或不读则失败并拒绝伪造哈希。规则是提示而非法律意见，发布前仍须人工复核平台现行规则。",
      inputSchema: {
        title: z.string().max(200),
        body: z.string().max(20000),
        topics: z.array(z.string().max(100)).max(50).default([]),
        assetPaths: z.array(z.string().max(2048)).max(20).default([]),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ title, body, topics, assetPaths }) => {
      const assetInspection = await inspectAssetFiles(assetPaths);
      const checks = [...checkContent(title, body, topics, assetPaths), ...assetInspection.checks];
      const hashComputed = assetInspection.checks.every((item) => item.level !== "error");
      return textResult({
        contentHash: hashComputed ? contentHash(title, body, topics, assetInspection.digests) : null,
        hashComputed,
        hashError: hashComputed ? undefined : "存在无法读取的素材，拒绝用路径字符串或空字节伪造哈希。",
        normalizedTopics: normalizeTopics(topics),
        assetDigests: hashComputed ? assetInspection.digests : [],
        checks,
      });
    },
  );

  server.registerTool(
    "save_draft",
    {
      title: "保存运营草稿",
      description: "把一条内容保存到本地工作区。素材路径必须指向磁盘上可读的普通文件，contentHash 计入真实文件字节。仅写本地数据，不会访问或发布到小红书。",
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
        const resolvedAssetPaths = assetPaths.map((path) => resolve(path));
        const hashed = await contentHashForAssetPaths(title.trim(), body.trim(), normalized, resolvedAssetPaths);
        const now = new Date().toISOString();
        const draft: ContentDraft = {
          id: randomUUID(), title: title.trim(), body: body.trim(), topics: normalized,
          assetPaths: resolvedAssetPaths, assetDigests: hashed.assetDigests, campaign: campaign?.trim(),
          status: "draft", contentHash: hashed.contentHash,
          createdAt: now, updatedAt: now,
        };
        await store.addDraft(draft);
        await store.audit("draft.create", "success", draft.id, { checkCount: checkContent(title, body, topics, assetPaths).length });
        return textResult({ draft: publicDraft(draft), checks: checkContent(title, body, topics, assetPaths) });
      } catch (error) {
        await store.audit("draft.create", "error", undefined, { message: (error as Error).message });
        return errorResult(error);
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
    "get_draft",
    {
      title: "读取单条运营草稿",
      description: "按 ID 读取一条本地草稿及其当前哈希。不访问外部服务，也不验证调用者是人类。",
      inputSchema: { draftId: z.uuid() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ draftId }) => {
      const draft = await store.getDraft(draftId);
      if (!draft) return textResult({ error: `Draft not found: ${draftId}` }, true);
      return textResult({
        draft: publicDraft(draft),
        approvalAuthenticatesHuman: false,
        approvalLimitation: APPROVAL_HUMAN_AUTH_LIMITATION,
      });
    },
  );

  server.registerTool(
    "update_draft",
    {
      title: "更新运营草稿",
      description: "更新本地草稿字段。省略的字段保持原值。会重新读取素材文件字节并重算 contentHash；哈希变化时清除批准并退回 draft。已发布或已取消的草稿不可改。不会访问小红书。",
      inputSchema: {
        draftId: z.uuid(),
        title: z.string().min(1).max(200).optional(),
        body: z.string().min(1).max(20000).optional(),
        topics: z.array(z.string().max(100)).max(50).optional(),
        assetPaths: z.array(z.string().max(2048)).max(20).optional(),
        campaign: z.string().max(200).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ draftId, title, body, topics, assetPaths, campaign }) => {
      try {
        assertWritable(config);
        const existing = await store.getDraft(draftId);
        if (!existing) throw new Error(`Draft not found: ${draftId}`);
        if (!UNPUBLISHED_MUTABLE_STATUSES.includes(existing.status)) {
          throw new Error(`Cannot update draft in status ${existing.status}`);
        }
        const nextTitle = title !== undefined ? title.trim() : existing.title;
        const nextBody = body !== undefined ? body.trim() : existing.body;
        const nextTopics = topics !== undefined ? normalizeTopics(topics) : existing.topics;
        const nextAssetPaths = assetPaths !== undefined ? assetPaths.map((path) => resolve(path)) : existing.assetPaths;
        const nextCampaign = campaign !== undefined ? (campaign.trim() || undefined) : existing.campaign;
        const hashed = await contentHashForAssetPaths(nextTitle, nextBody, nextTopics, nextAssetPaths);
        const draft = await store.updateDraft(draftId, (item) => {
          if (!UNPUBLISHED_MUTABLE_STATUSES.includes(item.status)) {
            throw new Error(`Cannot update draft in status ${item.status}`);
          }
          const previousHash = item.contentHash;
          const previousStatus = item.status;
          item.title = nextTitle;
          item.body = nextBody;
          item.topics = nextTopics;
          item.assetPaths = nextAssetPaths;
          item.assetDigests = hashed.assetDigests;
          item.campaign = nextCampaign;
          item.contentHash = hashed.contentHash;
          if (previousHash !== hashed.contentHash) {
            item.approvedAt = undefined;
            if (APPROVAL_RESET_STATUSES.includes(previousStatus)) item.status = "draft";
          }
        });
        await store.audit("draft.update", "success", draftId, {
          previousHash: existing.contentHash,
          contentHash: draft.contentHash,
          contentChanged: existing.contentHash !== draft.contentHash,
          previousStatus: existing.status,
          status: draft.status,
        });
        return textResult({
          draft: publicDraft(draft),
          contentChanged: existing.contentHash !== draft.contentHash,
          approvalReset: existing.status !== draft.status && draft.status === "draft",
          checks: checkContent(nextTitle, nextBody, nextTopics, nextAssetPaths),
        });
      } catch (error) {
        await store.audit("draft.update", "error", draftId, { message: (error as Error).message });
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "cancel_draft",
    {
      title: "取消运营草稿",
      description: "将未发布草稿标为 cancelled，并写入审计。不能取消已发布内容。不会访问小红书，也不会删除历史记录。",
      inputSchema: {
        draftId: z.uuid(),
        reason: z.string().min(3).max(500),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async ({ draftId, reason }) => {
      try {
        assertWritable(config);
        let previousStatus: DraftStatus | undefined;
        const draft = await store.updateDraft(draftId, (item) => {
          if (!UNPUBLISHED_MUTABLE_STATUSES.includes(item.status)) {
            throw new Error(`Cannot cancel draft in status ${item.status}`);
          }
          previousStatus = item.status;
          item.status = "cancelled";
        });
        await store.audit("draft.cancel", "success", draftId, { reason, previousStatus });
        return textResult({ draft: publicDraft(draft), cancelled: true });
      } catch (error) {
        await store.audit("draft.cancel", "error", draftId, { message: (error as Error).message });
        return errorResult(error);
      }
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
      description: "高风险操作：提供当前 contentHash 与固定确认短语后，把 in_review 草稿标为 approved。该短语不能验证调用者是人类，模型也可以调用本工具；不要把它当作真人授权边界。本工具不会发布到小红书。",
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
        return textResult({
          draft: publicDraft(draft),
          next: "调用 create_publish_package 生成供人工发布或官方适配器使用的交接包。最终发布必须由人在官方客户端完成。",
          approvalAuthenticatesHuman: false,
          approvalLimitation: APPROVAL_HUMAN_AUTH_LIMITATION,
        });
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

  if (config.openAccountOAuth.enabled) {
    const adapter = new OfficialOpenAccountOAuthAdapter(
      config.openAccountOAuth,
      new OfficialOauthTokenStore(config.dataDir),
      options.openAccountHttpClient ?? createOfficialOpenAccountFetchClient(config.openAccountOAuth.baseUrl),
    );
    registerOfficialOpenAccountOauthTools(server, adapter, store);
  }

  return server;
}
