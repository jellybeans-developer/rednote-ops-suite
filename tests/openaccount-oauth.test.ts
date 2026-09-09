import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { OpenAccountOAuthConfig } from "../src/config.js";
import {
  OFFICIAL_OAUTH_DISABLED_MESSAGE,
  OfficialOpenAccountOAuthAdapter,
  type OfficialOpenAccountApiResponse,
  type OfficialOpenAccountHttpClient,
} from "../src/openaccount/oauth-adapter.js";
import { assertPublicPayloadHasNoSecrets, redactSecretMaterial } from "../src/openaccount/secret-guard.js";
import { OfficialOauthTokenStore } from "../src/openaccount/token-store.js";

const SECRET_ACCESS_TOKEN = "SECRET_ACCESS_TOKEN_VALUE";
const SECRET_REFRESH_TOKEN = "SECRET_REFRESH_TOKEN_VALUE";
const SECRET_DEVICE_CODE = "SECRET_DEVICE_CODE_VALUE";
const FUTURE_UNIX = Math.floor(Date.now() / 1000) + 7200;
const REFRESH_FUTURE_UNIX = Math.floor(Date.now() / 1000) + 86400 * 10;

const enabledConfig: OpenAccountOAuthConfig = {
  enabled: true,
  appId: "xhs_test_app",
  appSecret: "sk_test_secret",
  baseUrl: "https://openaccount.xiaohongshu.com",
  scopes: ["basic_info"],
  scene: "web",
  clientName: "RedNote Ops Suite test",
};

function jsonHasSecrets(value: unknown): boolean {
  const serialized = JSON.stringify(value);
  return serialized.includes(SECRET_ACCESS_TOKEN)
    || serialized.includes(SECRET_REFRESH_TOKEN)
    || serialized.includes(SECRET_DEVICE_CODE)
    || serialized.includes("sk_test_secret");
}

function mockHttp(
  handler: (path: string, body: unknown, headers?: Record<string, string>) => OfficialOpenAccountApiResponse,
): OfficialOpenAccountHttpClient & { calls: Array<{ path: string; body: unknown; headers?: Record<string, string> }> } {
  const calls: Array<{ path: string; body: unknown; headers?: Record<string, string> }> = [];
  return {
    calls,
    async postJson(path, body, headers) {
      calls.push({ path, body, headers });
      return handler(path, body, headers);
    },
  };
}

async function createAdapter(
  http: OfficialOpenAccountHttpClient,
  config: OpenAccountOAuthConfig = enabledConfig,
) {
  const dataDir = await mkdtemp(join(tmpdir(), "rednote-oauth-"));
  const tokenStore = new OfficialOauthTokenStore(dataDir);
  return { dataDir, tokenStore, adapter: new OfficialOpenAccountOAuthAdapter(config, tokenStore, http) };
}

describe("official openaccount OAuth adapter", () => {
  it("fails closed when disabled", async () => {
    const { adapter } = await createAdapter(mockHttp(() => ({ code: 0, success: true, msg: "ok", data: {} })), {
      ...enabledConfig,
      enabled: false,
      appId: undefined,
      appSecret: undefined,
    });
    await expect(adapter.startDeviceAuthorization()).rejects.toThrow(OFFICIAL_OAUTH_DISABLED_MESSAGE);
    await expect(adapter.getConnectedProfile()).rejects.toThrow(/默认关闭|not a publishing API/i);
  });

  it("starts device auth without exposing device_code or app_secret", async () => {
    const http = mockHttp(() => ({
      code: 0,
      success: true,
      msg: "成功",
      data: {
        device_code: SECRET_DEVICE_CODE,
        user_code: "WDJB-MJHT",
        verification_uri: "https://openaccount.xiaohongshu.com/device",
        verification_uri_complete: "https://openaccount.xiaohongshu.com/device?user_code=WDJBMJHT",
        expires_in: 600,
        interval: 5,
      },
    }));
    const { adapter, tokenStore } = await createAdapter(http);
    const result = await adapter.startDeviceAuthorization();
    expect(result.status).toBe("authorization_started");
    expect(result.userCode).toBe("WDJB-MJHT");
    expect(result.publishesNotes).toBe(false);
    expect(result.verificationUriComplete).toContain("user_code=");
    expect(jsonHasSecrets(result)).toBe(false);
    assertPublicPayloadHasNoSecrets(result);
    expect((await tokenStore.read()).pendingDeviceAuthorization?.deviceCode).toBe(SECRET_DEVICE_CODE);
  });

  it("polls pending/scanned/authorized without returning tokens", async () => {
    const http = mockHttp((path) => {
      if (path.endsWith("/device/code")) {
        return {
          code: 0,
          success: true,
          msg: "成功",
          data: {
            device_code: SECRET_DEVICE_CODE,
            user_code: "AAAA-BBBB",
            verification_uri: "https://openaccount.xiaohongshu.com/device",
            verification_uri_complete: "https://openaccount.xiaohongshu.com/device?user_code=AAAABBBB",
            expires_in: 600,
            interval: 5,
          },
        };
      }
      if (http.calls.filter((call) => call.path.endsWith("/device/token")).length === 1) {
        return { code: 37002, success: false, msg: "Authorization pending", data: null };
      }
      if (http.calls.filter((call) => call.path.endsWith("/device/token")).length === 2) {
        return { code: 37009, success: false, msg: "scanned", data: null };
      }
      return {
        code: 0,
        success: true,
        msg: "成功",
        data: {
          access_token: SECRET_ACCESS_TOKEN,
          expire_time: FUTURE_UNIX,
          refresh_token: SECRET_REFRESH_TOKEN,
          refresh_expire_time: REFRESH_FUTURE_UNIX,
          open_id: "open-id-1",
          scope: ["basic_info"],
        },
      };
    });
    const { adapter, tokenStore } = await createAdapter(http);
    await adapter.startDeviceAuthorization();
    expect((await adapter.pollDeviceAuthorization()).status).toBe("pending");
    expect((await adapter.pollDeviceAuthorization()).status).toBe("scanned");
    const authorized = await adapter.pollDeviceAuthorization();
    expect(authorized.status).toBe("authorized");
    expect(authorized.openId).toBe("open-id-1");
    expect(authorized.publishesNotes).toBe(false);
    expect(jsonHasSecrets(authorized)).toBe(false);
    expect((await tokenStore.read()).session?.accessToken).toBe(SECRET_ACCESS_TOKEN);
  });

  it("reads min_user_info after refresh and never returns tokens", async () => {
    const http = mockHttp((path) => {
      if (path.endsWith("/refresh_token")) {
        return {
          code: 0,
          success: true,
          msg: "成功",
          data: {
            access_token: SECRET_ACCESS_TOKEN,
            expire_time: FUTURE_UNIX,
            refresh_token: SECRET_REFRESH_TOKEN,
            refresh_expire_time: REFRESH_FUTURE_UNIX,
            open_id: "open-id-2",
            scope: ["basic_info"],
          },
        };
      }
      if (path.endsWith("/batch_get_min_user_info")) {
        return {
          code: 0,
          success: true,
          msg: "成功",
          data: {
            open_id: "open-id-2",
            nickname: "测试昵称",
            avatar: "https://sns-avatar-qc.xhscdn.com/example",
            gender: 1,
            region: "上海",
          },
        };
      }
      throw new Error(`unexpected path ${path}`);
    });
    const { adapter, tokenStore } = await createAdapter(http);
    await tokenStore.write({
      schemaVersion: 1,
      session: {
        openId: "open-id-2",
        scope: ["basic_info"],
        accessToken: "expired-access",
        refreshToken: SECRET_REFRESH_TOKEN,
        accessTokenExpiresAt: new Date(Date.now() - 1000).toISOString(),
        refreshTokenExpiresAt: new Date(REFRESH_FUTURE_UNIX * 1000).toISOString(),
      },
    });
    const profile = await adapter.getConnectedProfile();
    expect(profile.nickname).toBe("测试昵称");
    expect(profile.publishesNotes).toBe(false);
    expect(jsonHasSecrets(profile)).toBe(false);
    expect(http.calls.some((call) => call.path.endsWith("/refresh_token"))).toBe(true);
  });

  it("fails closed when no profile is connected, then disconnects local state", async () => {
    const { adapter, tokenStore } = await createAdapter(mockHttp(() => ({ code: 0, success: true, msg: "ok", data: {} })));
    await expect(adapter.getConnectedProfile()).rejects.toThrow(/尚未连接|不能发笔记/);
    await tokenStore.write({
      schemaVersion: 1,
      session: {
        openId: "open-id-3",
        scope: ["basic_info"],
        accessToken: SECRET_ACCESS_TOKEN,
        refreshToken: SECRET_REFRESH_TOKEN,
        accessTokenExpiresAt: new Date(FUTURE_UNIX * 1000).toISOString(),
        refreshTokenExpiresAt: new Date(REFRESH_FUTURE_UNIX * 1000).toISOString(),
      },
    });
    const disconnected = await adapter.disconnectOfficialOauth();
    expect(disconnected.disconnected).toBe(true);
    expect(disconnected.publishesNotes).toBe(false);
    expect((await tokenStore.read()).session).toBeUndefined();
  });

  it("rejects public payloads that contain secret keys", () => {
    expect(() => assertPublicPayloadHasNoSecrets({ access_token: "x" })).toThrow(/密钥/);
    expect(() => assertPublicPayloadHasNoSecrets({ deviceCode: "x" })).toThrow(/密钥/);
    expect(() => assertPublicPayloadHasNoSecrets({ userCode: "ABCD-EFGH" })).not.toThrow();
    expect(redactSecretMaterial("Bearer xhs_at_abc Authorization")).toContain("[redacted]");
    expect(redactSecretMaterial("secret sk_test_value leftover")).not.toContain("sk_test_value");
  });
});
