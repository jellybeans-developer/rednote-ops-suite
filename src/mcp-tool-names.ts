/** 默认启用的本地运营工具（OAuth 关闭时的完整集合）。 */
export const CORE_MCP_TOOL_NAMES = [
  "safety_status",
  "check_content",
  "save_draft",
  "list_drafts",
  "get_draft",
  "update_draft",
  "cancel_draft",
  "submit_for_review",
  "approve_draft",
  "create_publish_package",
  "record_publication",
  "record_metrics",
  "operations_summary",
] as const;

export const START_DEVICE_AUTH_TOOL_NAME = "start_device_auth";
export const POLL_DEVICE_AUTH_TOOL_NAME = "poll_device_auth";
export const GET_CONNECTED_PROFILE_TOOL_NAME = "get_connected_profile";
export const DISCONNECT_OFFICIAL_OAUTH_TOOL_NAME = "disconnect_official_oauth";

/** 仅在显式启用官方 openaccount OAuth 时注册；不含任何发布能力。 */
export const OFFICIAL_OPENACCOUNT_OAUTH_TOOL_NAMES = [
  START_DEVICE_AUTH_TOOL_NAME,
  POLL_DEVICE_AUTH_TOOL_NAME,
  GET_CONNECTED_PROFILE_TOOL_NAME,
  DISCONNECT_OFFICIAL_OAUTH_TOOL_NAME,
] as const;

/** 仅在显式启用本机创作中心浏览器适配器时注册。 */
export const CREATOR_BROWSER_TOOL_NAMES = [
  "start_creator_login",
  "creator_session_status",
  "prepare_creator_publish",
  "publish_creator_draft",
  "close_creator_browser",
] as const;

export const PACKAGE_VERSION = "0.4.0";
