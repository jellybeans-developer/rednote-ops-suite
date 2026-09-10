import { mkdir } from "node:fs/promises";
import { extname } from "node:path";
import type { BrowserContext, Page } from "playwright-core";
import type { CreatorBrowserConfig } from "../config.js";

const OFFICIAL_CREATOR_HOSTS = new Set(["creator.rednote.com", "creator.xiaohongshu.com"]);

export interface CreatorSessionStatus {
  browserOpen: boolean;
  loggedIn: boolean;
  currentUrl: string;
  requiresUserLogin: boolean;
}

export interface CreatorPrepareInput {
  title: string;
  body: string;
  topics: string[];
  assetPaths: string[];
}

export interface CreatorPrepareResult {
  prepared: true;
  currentUrl: string;
  uploadedAssets: number;
  publishClicked: false;
}

export interface CreatorPublishResult {
  clicked: true;
  currentUrl: string;
  platformResultVerified: boolean;
}

export interface CreatorBrowserDriver {
  startLogin(): Promise<CreatorSessionStatus>;
  sessionStatus(): Promise<CreatorSessionStatus>;
  prepareDraft(input: CreatorPrepareInput): Promise<CreatorPrepareResult>;
  clickPublish(): Promise<CreatorPublishResult>;
  close(): Promise<void>;
}

export function assertOfficialCreatorUrl(rawUrl: string): URL {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" || !OFFICIAL_CREATOR_HOSTS.has(url.hostname)) {
    throw new Error(`Creator browser refused non-official URL: ${url.origin}`);
  }
  return url;
}

export function isCreatorPublishSuccessUrl(rawUrl: string): boolean {
  return assertOfficialCreatorUrl(rawUrl).pathname.includes("/publish/success");
}

async function fillFirstVisible(page: Page, selectors: string[], value: string, field: string): Promise<void> {
  for (const selector of selectors) {
    const candidate = page.locator(selector).first();
    if (await candidate.isVisible().catch(() => false)) {
      await candidate.fill(value);
      return;
    }
  }
  throw new Error(`找不到创作中心的${field}输入框；网页结构可能已经更新。没有点击发布。`);
}

export class PlaywrightCreatorDriver implements CreatorBrowserDriver {
  private context?: BrowserContext;
  private page?: Page;

  constructor(private readonly config: CreatorBrowserConfig) {
    assertOfficialCreatorUrl(config.loginUrl);
    assertOfficialCreatorUrl(config.publishUrl);
  }

  async startLogin(): Promise<CreatorSessionStatus> {
    const page = await this.ensurePage();
    await page.goto(this.config.loginUrl, { waitUntil: "domcontentloaded" });
    await page.bringToFront();
    return this.readStatus(page);
  }

  async sessionStatus(): Promise<CreatorSessionStatus> {
    const page = await this.ensurePage();
    if (page.url() === "about:blank") {
      await page.goto(this.config.loginUrl, { waitUntil: "domcontentloaded" });
    }
    return this.readStatus(page);
  }

  async prepareDraft(input: CreatorPrepareInput): Promise<CreatorPrepareResult> {
    const page = await this.ensurePage();
    await page.goto(this.config.publishUrl, { waitUntil: "domcontentloaded" });
    await page.bringToFront();
    await page.waitForTimeout(5000);
    if ((await this.readStatus(page)).requiresUserLogin) {
      throw new Error("创作中心登录已失效。请先调用 start_creator_login，并在可见浏览器中亲自扫码登录。没有点击发布。");
    }

    const unsupported = input.assetPaths.filter((path) => ![".jpg", ".jpeg", ".png", ".webp"].includes(extname(path).toLowerCase()));
    if (unsupported.length) {
      throw new Error(`当前模拟发布只支持图片素材：${unsupported.join(", ")}`);
    }
    if (input.assetPaths.length) {
      let upload = page.locator('input[type="file"][accept*=".jpg"], input[type="file"][accept*="image"]').first();
      if (!await upload.count()) {
        const imageTab = page.locator('.creator-tab:not([aria-hidden="true"])').filter({ hasText: "上传图文" }).last();
        await imageTab.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {
          throw new Error("找不到创作中心正常可见的“上传图文”标签。没有点击发布。");
        });
        await imageTab.click();
        await page.waitForTimeout(1000);
        upload = page.locator('input[type="file"][accept*=".jpg"], input[type="file"][accept*="image"]').first();
      }
      if (!await upload.count()) throw new Error("找不到创作中心的图片上传控件；网页结构可能已经更新。没有点击发布。");
      await upload.setInputFiles(input.assetPaths);
      await page.waitForTimeout(2000);
    }

    await fillFirstVisible(page, [
      'input[placeholder*="标题"]',
      'textarea[placeholder*="标题"]',
      'input[maxlength="20"]',
    ], input.title, "标题");
    const topicText = input.topics.map((topic) => `#${topic.replace(/^#+/, "")}`).join(" ");
    const body = topicText ? `${input.body}\n\n${topicText}` : input.body;
    await fillFirstVisible(page, [
      'div[contenteditable="true"]',
      'textarea[placeholder*="正文"]',
      'textarea[placeholder*="描述"]',
    ], body, "正文");

    return { prepared: true, currentUrl: page.url(), uploadedAssets: input.assetPaths.length, publishClicked: false };
  }

  async clickPublish(): Promise<CreatorPublishResult> {
    const page = await this.ensurePage();
    const url = assertOfficialCreatorUrl(page.url());
    if (!url.pathname.includes("publish")) throw new Error("当前不在官方发布页面，拒绝点击。请先调用 prepare_creator_publish。");
    await page.locator(".publish-page").evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    }).catch(() => undefined);
    await page.waitForTimeout(500);
    const publishHost = page.locator('xhs-publish-btn[is-publish="true"]').first();
    if (await publishHost.count()) {
      await publishHost.scrollIntoViewIfNeeded();
    }

    // The domestic Creator Center renders the submit controls inside an open
    // shadow root. Playwright's CSS/role locators pierce open shadow roots.
    const shadowButton = publishHost.getByRole("button", { name: /^(发布|立即发布)$/ }).first();
    const regularButton = page.getByRole("button", { name: /^(发布|立即发布)$/ }).first();
    const button = await shadowButton.isVisible().catch(() => false)
      ? shadowButton
      : await regularButton.isVisible().catch(() => false)
        ? regularButton
        : undefined;
    if (button) {
      if (!await button.isEnabled()) throw new Error("发布按钮当前不可用，请在可见浏览器中检查表单提示。");
      await button.click();
    } else if (await publishHost.isVisible().catch(() => false)) {
      // Some Creator Center builds use a closed shadow root. In that case the
      // verified host contains “暂存离开” on the left and “发布” on the right.
      if (await publishHost.getAttribute("submit-disabled") !== "false") {
        throw new Error("发布按钮当前不可用，请在可见浏览器中检查表单提示。");
      }
      const box = await publishHost.boundingBox();
      if (!box || box.width < 160 || box.height < 32 || box.height > 120) {
        throw new Error("发布组件尺寸异常；网页结构可能已经更新。没有点击任何按钮。");
      }
      const submitCenterX = box.width * 0.5 + Math.min(80, box.width * 0.25);
      await publishHost.click({ position: { x: submitCenterX, y: box.height * 0.5 } });
    } else {
      throw new Error("找不到明确标记为“发布”或“立即发布”的按钮；网页结构可能已经更新。没有点击任何按钮。");
    }
    await page.waitForURL((candidate) => candidate.pathname.includes("/publish/success"), {
      timeout: 10_000,
    }).catch(() => undefined);
    const currentUrl = page.url();
    const platformResultVerified = isCreatorPublishSuccessUrl(currentUrl);
    return { clicked: true, currentUrl, platformResultVerified };
  }

  async close(): Promise<void> {
    await this.context?.close();
    this.context = undefined;
    this.page = undefined;
  }

  private async ensurePage(): Promise<Page> {
    if (!this.context) {
      await mkdir(this.config.profileDir, { recursive: true, mode: 0o700 });
      const { chromium } = await import("playwright-core");
      this.context = await chromium.launchPersistentContext(this.config.profileDir, {
        channel: this.config.channel,
        headless: false,
        viewport: null,
      });
      this.context.on("close", () => { this.context = undefined; this.page = undefined; });
    }
    this.page = this.page && !this.page.isClosed() ? this.page : (this.context.pages()[0] ?? await this.context.newPage());
    return this.page;
  }

  private async readStatus(page: Page): Promise<CreatorSessionStatus> {
    const url = assertOfficialCreatorUrl(page.url());
    const requiresUserLogin = url.pathname.includes("login");
    return { browserOpen: true, loggedIn: !requiresUserLogin, currentUrl: url.toString(), requiresUserLogin };
  }
}
