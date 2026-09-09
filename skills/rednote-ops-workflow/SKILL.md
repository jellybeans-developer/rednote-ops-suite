---
name: rednote-ops-workflow
description: Run the RedNote Ops draft → hash-bound approval → human publish handoff workflow. Use when preparing Xiaohongshu/RedNote notes, reviewing drafts, or recording a human publication. Never auto-publish.
---

# 小红书安全运营工作流

本技能只覆盖本地 MCP 运营闭环。官方 openaccount 文档提供 OAuth 与基础资料（`min_user_info`），**没有**文档化的通用第三方发笔记 API。OAuth ≠ 发布权限。

## 何时使用

- 用户要做选题、写稿、预检、排期、审稿或交接发布
- 用户问 Grok Bot / Cursor 今天能做什么

## 必须遵守

1. 首次先调用 `safety_status`，用一句话说明边界：无 Cookie、无私有 API、无静默发布；确认短语不能验证人类。
2. 工作顺序：`check_content` → `save_draft` → 展示标题/正文/话题/素材路径/文件字节摘要/`contentHash` → `submit_for_review`。
3. 改稿用 `update_draft`；哈希变化后必须重新审核。废弃未发布稿用 `cancel_draft`。
4. 只有用户在当前对话中明确批准**这一版**（含当前哈希）时才调用 `approve_draft`。不要代用户生成批准意图。
5. `create_publish_package` 只生成交接包。然后指导用户在**小红书官方客户端**完成发布。
6. 人发完后再 `record_publication`，指标用 `record_metrics` 手工录入，用 `operations_summary` 复盘。
7. 若出现 `start_device_auth` 等 OAuth 工具，它们只用于官方设备授权与资料读取，**不能发笔记**。

## 人工发布步骤

1. 打开官方客户端，按交接包粘贴标题、正文、话题并附上本地素材。
2. 由人点击发布。
3. 把公开笔记 ID 交给 `record_publication`。
