const FORBIDDEN_SECRET_KEYS = new Set([
  "accesstoken",
  "refreshtoken",
  "appsecret",
  "devicecode",
]);

function normalizedKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

/**
 * 工具返回值不得包含 OAuth 密钥字段。命中则抛错，避免 token 进入 MCP 响应。
 */
export function assertPublicPayloadHasNoSecrets(payload: unknown, path = "$"): void {
  if (Array.isArray(payload)) {
    payload.forEach((item, index) => assertPublicPayloadHasNoSecrets(item, `${path}[${index}]`));
    return;
  }
  if (payload && typeof payload === "object") {
    for (const [key, value] of Object.entries(payload)) {
      if (FORBIDDEN_SECRET_KEYS.has(normalizedKey(key))) {
        throw new Error("拒绝返回可能包含 OAuth 密钥的字段");
      }
      assertPublicPayloadHasNoSecrets(value, `${path}.${key}`);
    }
  }
}

/** 从日志或错误字符串中去掉疑似官方 token / app_secret。 */
export function redactSecretMaterial(text: string): string {
  return text
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/xhs_(?:at|rt|dc)_[A-Za-z0-9_-]+/gi, "[redacted]")
    .replace(/\bsk_[A-Za-z0-9_-]+/g, "[redacted]");
}
