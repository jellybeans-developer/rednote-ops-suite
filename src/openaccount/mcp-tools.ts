import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { JsonStore } from "../store.js";
import {
  DISCONNECT_OFFICIAL_OAUTH_TOOL_NAME,
  GET_CONNECTED_PROFILE_TOOL_NAME,
  POLL_DEVICE_AUTH_TOOL_NAME,
  START_DEVICE_AUTH_TOOL_NAME,
} from "../mcp-tool-names.js";
import { OfficialOpenAccountOAuthAdapter } from "./oauth-adapter.js";
import { assertPublicPayloadHasNoSecrets, redactSecretMaterial } from "./secret-guard.js";

function textResult(value: unknown, isError = false) {
  assertPublicPayloadHasNoSecrets(value);
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    isError,
  };
}

function errorTextResult(error: unknown) {
  return textResult({ error: redactSecretMaterial((error as Error).message), publishesNotes: false }, true);
}

export function registerOfficialOpenAccountOauthTools(
  server: McpServer,
  adapter: OfficialOpenAccountOAuthAdapter,
  store: JsonStore,
): void {
  server.registerTool(
    START_DEVICE_AUTH_TOOL_NAME,
    {
      title: "开始官方设备授权",
      description: "调用小红书官方 openaccount 设备授权接口，返回 user_code 与扫码地址。不会返回 device_code 或 token。不能发笔记。",
      inputSchema: {},
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async () => {
      try {
        const result = await adapter.startDeviceAuthorization();
        await store.audit("openaccount.device_auth.start", "success", undefined, {
          userCode: result.userCode,
          publishesNotes: false,
        });
        return textResult(result);
      } catch (error) {
        await store.audit("openaccount.device_auth.start", "error", undefined, {
          message: redactSecretMaterial((error as Error).message),
        });
        return errorTextResult(error);
      }
    },
  );

  server.registerTool(
    POLL_DEVICE_AUTH_TOOL_NAME,
    {
      title: "轮询官方设备授权",
      description: "对官方 device/token 接口做一次轮询。授权成功后只返回 open_id 与 scope，永不返回 token。不能发笔记。",
      inputSchema: {},
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async () => {
      try {
        const result = await adapter.pollDeviceAuthorization();
        await store.audit("openaccount.device_auth.poll", result.status === "error" ? "error" : "success", result.openId, {
          status: result.status,
          officialCode: result.officialCode,
          publishesNotes: false,
        });
        return textResult(result, result.status === "error");
      } catch (error) {
        await store.audit("openaccount.device_auth.poll", "error", undefined, {
          message: redactSecretMaterial((error as Error).message),
        });
        return errorTextResult(error);
      }
    },
  );

  server.registerTool(
    GET_CONNECTED_PROFILE_TOOL_NAME,
    {
      title: "读取已连接的官方资料",
      description: "使用官方 min_user_info 读取当前授权用户的基础资料。需要时会刷新 token。不返回 token，也不能发笔记。",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () => {
      try {
        const result = await adapter.getConnectedProfile();
        await store.audit("openaccount.profile.read", "success", result.openId, {
          nicknamePresent: Boolean(result.nickname),
          publishesNotes: false,
        });
        return textResult(result);
      } catch (error) {
        await store.audit("openaccount.profile.read", "error", undefined, {
          message: redactSecretMaterial((error as Error).message),
        });
        return errorTextResult(error);
      }
    },
  );

  server.registerTool(
    DISCONNECT_OFFICIAL_OAUTH_TOOL_NAME,
    {
      title: "断开官方 OAuth 会话",
      description: "删除本机保存的官方 openaccount 会话。不会发笔记，也不会调用未文档化接口。",
      inputSchema: {},
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async () => {
      try {
        const result = await adapter.disconnectOfficialOauth();
        await store.audit("openaccount.oauth.disconnect", "success", undefined, { publishesNotes: false });
        return textResult(result);
      } catch (error) {
        await store.audit("openaccount.oauth.disconnect", "error", undefined, {
          message: redactSecretMaterial((error as Error).message),
        });
        return errorTextResult(error);
      }
    },
  );
}
