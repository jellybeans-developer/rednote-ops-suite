import { randomUUID } from "node:crypto";
import type { OpenAccountOAuthConfig } from "../config.js";
import { assertPublicPayloadHasNoSecrets } from "./secret-guard.js";
import {
  OfficialOauthTokenStore,
  type OfficialOauthSession,
  type PendingDeviceAuthorization,
} from "./token-store.js";

export const OFFICIAL_OAUTH_DISABLED_MESSAGE =
  "官方 openaccount OAuth 适配器默认关闭。它只覆盖设备授权、token 刷新与 min_user_info，不能发笔记。Official Xiaohongshu openaccount OAuth is not a publishing API.";

export const OAUTH_IS_NOT_PUBLISH_PERMISSION =
  "OAuth ≠ 发布权限。官方 openaccount 文档没有通用第三方笔记发布 API。注册官方应用是使用者自己的责任。";

const DEVICE_AUTHORIZATION_PENDING = 37002;
const DEVICE_AUTHORIZATION_SCANNED = 37009;
const ACCESS_TOKEN_REFRESH_SKEW_MS = 60_000;

export interface OfficialOpenAccountApiResponse {
  code: number;
  success: boolean;
  msg: string;
  data: unknown;
}

export interface OfficialOpenAccountHttpClient {
  postJson(path: string, body: unknown, headers?: Record<string, string>): Promise<OfficialOpenAccountApiResponse>;
}

export interface DeviceAuthorizationStartResult {
  status: "authorization_started";
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresInSeconds: number;
  intervalSeconds: number;
  publishesNotes: false;
  warning: string;
}

export interface DeviceAuthorizationPollResult {
  status: "pending" | "scanned" | "authorized" | "error";
  officialCode?: number;
  officialMessage?: string;
  openId?: string;
  scope?: string[];
  publishesNotes: false;
  warning: string;
}

export interface ConnectedProfileResult {
  connected: true;
  openId: string;
  nickname?: string;
  avatar?: string;
  gender?: number;
  region?: string;
  scope: string[];
  publishesNotes: false;
  warning: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function unixSecondsToIso(value: unknown): string {
  const seconds = asNumber(value);
  if (!seconds) throw new Error("官方接口未返回有效的过期时间");
  return new Date(seconds * 1000).toISOString();
}

export function createOfficialOpenAccountFetchClient(baseUrl: string): OfficialOpenAccountHttpClient {
  return {
    async postJson(path, body, headers = {}) {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body ?? {}),
      });
      let parsed: unknown;
      try {
        parsed = await response.json();
      } catch {
        throw new Error(`官方 openaccount 接口返回了无法解析的响应（HTTP ${response.status}）`);
      }
      const record = asRecord(parsed);
      return {
        code: asNumber(record.code) ?? (response.ok ? 0 : response.status),
        success: record.success === true,
        msg: asString(record.msg) || `HTTP ${response.status}`,
        data: record.data,
      };
    },
  };
}

export class OfficialOpenAccountOAuthAdapter {
  constructor(
    private readonly config: OpenAccountOAuthConfig,
    private readonly tokenStore: OfficialOauthTokenStore,
    private readonly httpClient: OfficialOpenAccountHttpClient,
  ) {}

  assertEnabled(): void {
    if (!this.config.enabled) {
      throw new Error(OFFICIAL_OAUTH_DISABLED_MESSAGE);
    }
    if (!this.config.appId || !this.config.appSecret) {
      throw new Error(
        "已启用官方 openaccount OAuth，但缺少 REDNOTE_OPENACCOUNT_APP_ID / REDNOTE_OPENACCOUNT_APP_SECRET。注册官方应用是使用者自己的责任。",
      );
    }
  }

  async startDeviceAuthorization(): Promise<DeviceAuthorizationStartResult> {
    this.assertEnabled();
    const response = await this.httpClient.postJson("/api/sns/v1/oauth2/device/code", {
      app_id: this.config.appId,
      app_secret: this.config.appSecret,
      scopes: this.config.scopes,
      client_name: this.config.clientName,
      device_id: randomUUID(),
      scene: this.config.scene,
    });
    if (!response.success || response.code !== 0) {
      throw new Error(this.officialFailureMessage("创建设备授权失败", response));
    }
    const data = asRecord(response.data);
    const pending: PendingDeviceAuthorization = {
      deviceCode: asString(data.device_code) || "",
      userCode: asString(data.user_code) || "",
      verificationUri: asString(data.verification_uri) || "",
      verificationUriComplete: asString(data.verification_uri_complete) || "",
      intervalSeconds: asNumber(data.interval) || 5,
      expiresAt: new Date(Date.now() + (asNumber(data.expires_in) || 600) * 1000).toISOString(),
    };
    if (!pending.deviceCode || !pending.userCode || !pending.verificationUriComplete) {
      throw new Error("官方设备授权响应缺少 user_code 或 verification_uri_complete");
    }
    const current = await this.tokenStore.read();
    await this.tokenStore.write({
      schemaVersion: 1,
      session: current.session,
      pendingDeviceAuthorization: pending,
    });
    return this.publicResult({
      status: "authorization_started",
      userCode: pending.userCode,
      verificationUri: pending.verificationUri,
      verificationUriComplete: pending.verificationUriComplete,
      expiresInSeconds: Math.max(0, Math.floor((Date.parse(pending.expiresAt) - Date.now()) / 1000)),
      intervalSeconds: pending.intervalSeconds,
      publishesNotes: false,
      warning: OAUTH_IS_NOT_PUBLISH_PERMISSION,
    });
  }

  async pollDeviceAuthorization(): Promise<DeviceAuthorizationPollResult> {
    this.assertEnabled();
    const current = await this.tokenStore.read();
    const pending = current.pendingDeviceAuthorization;
    if (!pending) {
      throw new Error("没有进行中的设备授权。请先调用 start_device_auth。");
    }
    if (Date.parse(pending.expiresAt) <= Date.now()) {
      await this.tokenStore.write({ schemaVersion: 1, session: current.session });
      throw new Error("设备授权已过期，请重新 start_device_auth。");
    }
    const response = await this.httpClient.postJson("/api/sns/v1/oauth2/device/token", {
      app_id: this.config.appId,
      app_secret: this.config.appSecret,
      device_code: pending.deviceCode,
    });
    if (response.code === DEVICE_AUTHORIZATION_PENDING) {
      return this.publicResult({
        status: "pending",
        officialCode: response.code,
        officialMessage: response.msg,
        publishesNotes: false,
        warning: OAUTH_IS_NOT_PUBLISH_PERMISSION,
      });
    }
    if (response.code === DEVICE_AUTHORIZATION_SCANNED) {
      return this.publicResult({
        status: "scanned",
        officialCode: response.code,
        officialMessage: response.msg,
        publishesNotes: false,
        warning: OAUTH_IS_NOT_PUBLISH_PERMISSION,
      });
    }
    if (!response.success || response.code !== 0) {
      return this.publicResult({
        status: "error",
        officialCode: response.code,
        officialMessage: response.msg,
        publishesNotes: false,
        warning: OAUTH_IS_NOT_PUBLISH_PERMISSION,
      });
    }
    const session = this.sessionFromTokenPayload(asRecord(response.data));
    await this.tokenStore.write({ schemaVersion: 1, session });
    return this.publicResult({
      status: "authorized",
      openId: session.openId,
      scope: session.scope,
      publishesNotes: false,
      warning: OAUTH_IS_NOT_PUBLISH_PERMISSION,
    });
  }

  async getConnectedProfile(): Promise<ConnectedProfileResult> {
    this.assertEnabled();
    const session = await this.requireFreshSession();
    const response = await this.httpClient.postJson(
      "/api/sns/v1/oauth2/batch_get_min_user_info",
      {},
      { Authorization: `Bearer ${session.accessToken}` },
    );
    if (!response.success || response.code !== 0) {
      throw new Error(this.officialFailureMessage("读取 min_user_info 失败", response));
    }
    const data = asRecord(response.data);
    return this.publicResult({
      connected: true,
      openId: asString(data.open_id) || session.openId,
      nickname: asString(data.nickname),
      avatar: asString(data.avatar),
      gender: asNumber(data.gender),
      region: asString(data.region),
      scope: session.scope,
      publishesNotes: false,
      warning: OAUTH_IS_NOT_PUBLISH_PERMISSION,
    });
  }

  async disconnectOfficialOauth(): Promise<{ disconnected: true; publishesNotes: false; warning: string }> {
    this.assertEnabled();
    await this.tokenStore.clear();
    return this.publicResult({
      disconnected: true,
      publishesNotes: false,
      warning: "已删除本地官方 OAuth 会话。请在小红书 App「已授权的应用」中按需解除授权。此操作不能发笔记。",
    });
  }

  private async requireFreshSession(): Promise<OfficialOauthSession> {
    const current = await this.tokenStore.read();
    if (!current.session) {
      throw new Error("尚未连接官方 openaccount 资料。请先完成设备授权。OAuth 不能发笔记。");
    }
    if (Date.parse(current.session.accessTokenExpiresAt) - ACCESS_TOKEN_REFRESH_SKEW_MS > Date.now()) {
      return current.session;
    }
    if (Date.parse(current.session.refreshTokenExpiresAt) <= Date.now()) {
      throw new Error("官方 refresh_token 已过期，请重新 start_device_auth。OAuth 不能发笔记。");
    }
    const response = await this.httpClient.postJson("/api/sns/v1/oauth2/refresh_token", {
      app_id: this.config.appId,
      refresh_token: current.session.refreshToken,
    });
    if (!response.success || response.code !== 0) {
      throw new Error(this.officialFailureMessage("刷新官方 access_token 失败", response));
    }
    const session = this.sessionFromTokenPayload(asRecord(response.data), current.session);
    await this.tokenStore.write({
      schemaVersion: 1,
      pendingDeviceAuthorization: current.pendingDeviceAuthorization,
      session,
    });
    return session;
  }

  private sessionFromTokenPayload(
    data: Record<string, unknown>,
    previous?: OfficialOauthSession,
  ): OfficialOauthSession {
    const accessToken = asString(data.access_token);
    const refreshToken = asString(data.refresh_token) || previous?.refreshToken;
    const openId = asString(data.open_id) || previous?.openId;
    if (!accessToken || !refreshToken || !openId) {
      throw new Error("官方 token 响应缺少必要字段");
    }
    const scope = Array.isArray(data.scope)
      ? data.scope.filter((item): item is string => typeof item === "string")
      : previous?.scope ?? this.config.scopes;
    return {
      openId,
      scope,
      accessToken,
      refreshToken,
      accessTokenExpiresAt: unixSecondsToIso(data.expire_time),
      refreshTokenExpiresAt: unixSecondsToIso(data.refresh_expire_time),
    };
  }

  private officialFailureMessage(prefix: string, response: OfficialOpenAccountApiResponse): string {
    return `${prefix}（code=${response.code}）：${response.msg}`;
  }

  private publicResult<T>(payload: T): T {
    assertPublicPayloadHasNoSecrets(payload);
    return payload;
  }
}
