import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { JsonStore } from "../store.js";
import type { CreatorBrowserDriver } from "./driver.js";

const PUBLISH_CONFIRMATION = "PUBLISH_TO_XIAOHONGSHU";

function result(value: unknown, isError = false) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }], isError };
}

export function registerCreatorBrowserTools(
  server: McpServer,
  driver: CreatorBrowserDriver,
  store: JsonStore,
  config: AppConfig,
): void {
  server.registerTool("start_creator_login", {
    title: "打开小红书创作中心登录",
    description: "打开可见的官方创作中心。用户必须亲自扫码或完成验证；工具不读取密码、验证码或导出 Cookie。",
    inputSchema: {},
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, async () => {
    try {
      const status = await driver.startLogin();
      await store.audit("creator.login.open", "success", undefined, { loggedIn: status.loggedIn });
      return result({ ...status, instruction: status.loggedIn ? "会话已登录。" : "请在弹出的官方页面中亲自完成扫码登录，然后调用 creator_session_status。" });
    } catch (error) {
      await store.audit("creator.login.open", "error", undefined, { message: (error as Error).message });
      return result({ error: (error as Error).message }, true);
    }
  });

  server.registerTool("creator_session_status", {
    title: "检查创作中心登录状态",
    description: "检查本机可见浏览器当前是否停在官方登录页。不返回 Cookie 或令牌。",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, async () => {
    try { return result(await driver.sessionStatus()); }
    catch (error) { return result({ error: (error as Error).message }, true); }
  });

  server.registerTool("prepare_creator_publish", {
    title: "在创作中心填写已批准草稿",
    description: "在可见的官方创作中心上传图片并填写标题、正文和话题。只填表，不点击发布。要求草稿已生成发布交接包且哈希匹配。",
    inputSchema: { draftId: z.uuid(), expectedContentHash: z.string().length(64) },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, async ({ draftId, expectedContentHash }) => {
    try {
      if (config.readOnly) throw new Error("Server is running in read-only mode");
      const draft = await store.getDraft(draftId);
      if (!draft) throw new Error(`Draft not found: ${draftId}`);
      if (draft.status !== "ready_to_publish") throw new Error(`Draft must be ready_to_publish, current status: ${draft.status}`);
      if (draft.contentHash !== expectedContentHash) throw new Error("Content hash mismatch; review the current draft again");
      const prepared = await driver.prepareDraft(draft);
      await store.audit("creator.publish.prepare", "success", draftId, { contentHash: draft.contentHash, uploadedAssets: prepared.uploadedAssets });
      return result({ ...prepared, draftId, contentHash: draft.contentHash, next: "在可见浏览器中核对内容。若部署者允许自动点击，再调用 publish_creator_draft。" });
    } catch (error) {
      await store.audit("creator.publish.prepare", "error", draftId, { message: (error as Error).message });
      return result({ error: (error as Error).message }, true);
    }
  });

  server.registerTool("publish_creator_draft", {
    title: "点击创作中心发布按钮",
    description: "高风险操作：在官方创作中心点击明确的发布按钮。仅在 REDNOTE_CREATOR_ALLOW_PUBLISH=true、草稿已准备、哈希匹配且提供固定确认短语时执行。若官方页面跳转到 /publish/success，会返回已验证成功；遇到扫码等安全验证时保持未验证状态。",
    inputSchema: {
      draftId: z.uuid(),
      expectedContentHash: z.string().length(64),
      confirmation: z.literal(PUBLISH_CONFIRMATION),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  }, async ({ draftId, expectedContentHash }) => {
    try {
      if (!config.creatorBrowser.allowPublish) throw new Error("自动点击发布默认关闭。只有部署者设置 REDNOTE_CREATOR_ALLOW_PUBLISH=true 后才能使用。");
      if (config.readOnly) throw new Error("Server is running in read-only mode");
      const draft = await store.getDraft(draftId);
      if (!draft) throw new Error(`Draft not found: ${draftId}`);
      if (draft.status !== "ready_to_publish") throw new Error(`Draft must be ready_to_publish, current status: ${draft.status}`);
      if (draft.contentHash !== expectedContentHash) throw new Error("Content hash mismatch; publication denied");
      const submitted = await driver.clickPublish();
      await store.audit("creator.publish.click", "success", draftId, { contentHash: draft.contentHash, currentUrl: submitted.currentUrl });
      return result({
        ...submitted,
        draftId,
        status: submitted.platformResultVerified ? "publish_succeeded" : "publish_clicked_result_unverified",
        next: submitted.platformResultVerified
          ? "官方创作中心已进入发布成功页。取得公开笔记 ID 后调用 record_publication 更新本地台账。"
          : "平台可能正在等待扫码或其他安全验证。请在可见浏览器中完成验证，再检查笔记管理。",
      });
    } catch (error) {
      await store.audit("creator.publish.click", "denied", draftId, { message: (error as Error).message });
      return result({ error: (error as Error).message }, true);
    }
  });

  server.registerTool("close_creator_browser", {
    title: "关闭创作中心浏览器",
    description: "关闭由适配器启动的本机浏览器。不会删除本地浏览器 Profile，因此下次可能继续使用登录会话。",
    inputSchema: {},
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async () => {
    await driver.close();
    await store.audit("creator.browser.close", "success");
    return result({ closed: true, profilePreserved: true });
  });
}
