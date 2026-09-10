import { resolve } from "node:path";

const OFFICIAL_OPENACCOUNT_BASE_URLS = [
  "https://openaccount.xiaohongshu.com",
  "https://openaccount.beta.xiaohongshu.com",
] as const;

export interface OpenAccountOAuthConfig {
  enabled: boolean;
  appId?: string;
  appSecret?: string;
  baseUrl: string;
  scopes: string[];
  scene: "web";
  clientName: string;
}

export interface AppConfig {
  dataDir: string;
  readOnly: boolean;
  host: string;
  port: number;
  httpToken?: string;
  openAccountOAuth: OpenAccountOAuthConfig;
  creatorBrowser: CreatorBrowserConfig;
}

export interface CreatorBrowserConfig {
  enabled: boolean;
  allowPublish: boolean;
  profileDir: string;
  channel: "chrome" | "msedge";
  loginUrl: string;
  publishUrl: string;
}

function parseBoolean(value: string | undefined): boolean {
  return value?.toLowerCase() === "true" || value === "1";
}

function parseOpenAccountOAuth(env: NodeJS.ProcessEnv): OpenAccountOAuthConfig {
  const enabled = parseBoolean(env.REDNOTE_OPENACCOUNT_OAUTH_ENABLED);
  const baseUrl = (env.REDNOTE_OPENACCOUNT_BASE_URL?.trim() || OFFICIAL_OPENACCOUNT_BASE_URLS[0]).replace(/\/$/, "");
  const clientName = env.REDNOTE_OPENACCOUNT_CLIENT_NAME?.trim() || "RedNote Ops Suite";
  const disabled: OpenAccountOAuthConfig = {
    enabled: false,
    baseUrl: OFFICIAL_OPENACCOUNT_BASE_URLS[0],
    scopes: ["basic_info"],
    scene: "web",
    clientName,
  };
  if (!enabled) return disabled;

  if (!OFFICIAL_OPENACCOUNT_BASE_URLS.includes(baseUrl as typeof OFFICIAL_OPENACCOUNT_BASE_URLS[number])) {
    throw new Error(
      "REDNOTE_OPENACCOUNT_BASE_URL 必须是官方 openaccount 生产或 beta 地址。OAuth 不能发笔记。",
    );
  }
  const appId = env.REDNOTE_OPENACCOUNT_APP_ID?.trim();
  const appSecret = env.REDNOTE_OPENACCOUNT_APP_SECRET?.trim();
  if (!appId || !appSecret) {
    throw new Error(
      "已启用官方 openaccount OAuth，但缺少 REDNOTE_OPENACCOUNT_APP_ID 与 REDNOTE_OPENACCOUNT_APP_SECRET。注册官方应用是使用者自己的责任。OAuth ≠ 发布权限；请将 REDNOTE_OPENACCOUNT_OAUTH_ENABLED 保持关闭。",
    );
  }
  const scopes = (env.REDNOTE_OPENACCOUNT_SCOPES?.trim() || "basic_info")
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
  if (scopes.length !== 1 || scopes[0] !== "basic_info") {
    throw new Error(
      "此脚手架只申请官方已文档化的 basic_info。它不是发笔记权限，也不会请求未文档化的发布 scope。",
    );
  }
  return {
    enabled: true,
    appId,
    appSecret,
    baseUrl,
    scopes,
    scene: "web",
    clientName,
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const host = env.REDNOTE_HOST?.trim() || "127.0.0.1";
  const token = env.REDNOTE_MCP_TOKEN?.trim() || undefined;
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1" && (!token || token.length < 32)) {
    throw new Error("REDNOTE_MCP_TOKEN (at least 32 characters) is required when binding outside loopback");
  }

  const port = Number(env.REDNOTE_PORT || 3210);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("REDNOTE_PORT must be an integer from 1 to 65535");
  }

  const dataDir = resolve(env.REDNOTE_DATA_DIR || ".rednote-ops");
  const creatorBrowserEnabled = parseBoolean(env.REDNOTE_CREATOR_BROWSER_ENABLED);
  const creatorAllowPublish = parseBoolean(env.REDNOTE_CREATOR_ALLOW_PUBLISH);
  if (creatorAllowPublish && !creatorBrowserEnabled) {
    throw new Error("REDNOTE_CREATOR_ALLOW_PUBLISH requires REDNOTE_CREATOR_BROWSER_ENABLED=true");
  }
  const creatorChannel = env.REDNOTE_CREATOR_BROWSER_CHANNEL?.trim() || "chrome";
  if (creatorChannel !== "chrome" && creatorChannel !== "msedge") {
    throw new Error("REDNOTE_CREATOR_BROWSER_CHANNEL must be chrome or msedge");
  }

  return {
    dataDir,
    readOnly: parseBoolean(env.REDNOTE_READ_ONLY),
    host,
    port,
    httpToken: token,
    openAccountOAuth: parseOpenAccountOAuth(env),
    creatorBrowser: {
      enabled: creatorBrowserEnabled,
      allowPublish: creatorAllowPublish,
      profileDir: resolve(env.REDNOTE_CREATOR_PROFILE_DIR || dataDir, "creator-browser-profile"),
      channel: creatorChannel,
      loginUrl: "https://creator.rednote.com/login?source=official",
      publishUrl: "https://creator.rednote.com/publish/publish?source=official",
    },
  };
}
