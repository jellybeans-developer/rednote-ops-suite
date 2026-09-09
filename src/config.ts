import { resolve } from "node:path";

export interface AppConfig {
  dataDir: string;
  readOnly: boolean;
  host: string;
  port: number;
  httpToken?: string;
}

function parseBoolean(value: string | undefined): boolean {
  return value?.toLowerCase() === "true" || value === "1";
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

  return {
    dataDir: resolve(env.REDNOTE_DATA_DIR || ".rednote-ops"),
    readOnly: parseBoolean(env.REDNOTE_READ_ONLY),
    host,
    port,
    httpToken: token,
  };
}
