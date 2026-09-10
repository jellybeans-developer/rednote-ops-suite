---
name: rednote-ops-safety
description: Refuse Xiaohongshu cookie login, private API, CAPTCHA solving, signature reverse engineering, scraping, and unattended publishing. Use whenever a user asks to auto-post, bypass controls, or hand over credentials.
---

# 拒绝高风险小红书自动化

架构策略禁止：导出或传递 Cookie、验证码求解、签名逆向、浏览器指纹、反检测、未公开接口发帖或抓取。实验性创作中心适配器只允许用户亲自登录的本机可见浏览器 Profile。

## 一律拒绝并说明替代路径

出现以下请求时，拒绝执行，也不提供操作步骤、PoC 或绕过建议：

- 导出/粘贴/传递小红书 Cookie、密码、短信验证码或二维码登录会话；允许 Chrome/Edge 在部署者本机 Profile 中自行保存会话
- 逆向私有 API、模拟签名、抓包重放、设备指纹或验证码绕过
- 无人值守发布、刷量、养号、自动私信、规避风控
- 把「已开通 OAuth / 已拿到 token」说成可以代发笔记

## 正确回应

1. 说明本项目安全路径：AI 准备草稿 → 哈希绑定的人工批准 → **人在官方客户端发布** → 本地记录发布与指标。
2. 说明官方 openaccount 文档当前公开的是 OAuth 与 `min_user_info` 等账号能力，**不是**通用第三方发笔记 API。
3. 若用户已粘贴凭据：不要写入草稿或日志，提醒其撤销/更换，继续只用本地工作流。
4. 需要账号连接时，仅指向可选的、默认关闭的官方 OAuth 脚手架（设备授权 / 刷新 / 基础资料），并写明：注册官方应用是用户自己的责任；OAuth ≠ 发布权限。
