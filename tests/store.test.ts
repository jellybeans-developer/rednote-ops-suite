import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JsonStore } from "../src/store.js";
import type { ContentDraft } from "../src/types.js";

describe("JsonStore", () => {
  it("serializes writes from different HTTP sessions sharing one directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "rednote-concurrent-"));
    const first = new JsonStore(dir);
    const second = new JsonStore(dir);
    await first.init();
    await second.init();
    await Promise.all(Array.from({ length: 30 }, (_, i) =>
      (i % 2 ? first : second).transaction(async (db) => {
        await new Promise((done) => setTimeout(done, 1));
        db.metrics.push({ id: String(i), draftId: "test", capturedAt: new Date().toISOString(), source: "manual" });
      })
    ));
    expect((await first.read()).metrics).toHaveLength(30);
  });
  it("persists drafts and writes metadata-only audit events", async () => {
    const dir = await mkdtemp(join(tmpdir(), "rednote-store-"));
    const store = new JsonStore(dir);
    await store.init();
    const now = new Date().toISOString();
    const draft: ContentDraft = {
      id: "draft-1", title: "标题", body: "SECRET_BODY", topics: [], assetPaths: [],
      status: "draft", contentHash: "a".repeat(64), createdAt: now, updatedAt: now,
    };
    await store.addDraft(draft);
    await store.audit("draft.create", "success", draft.id, { checkCount: 0 });
    expect((await store.getDraft("draft-1"))?.body).toBe("SECRET_BODY");
    expect(await readFile(store.auditPath, "utf8")).not.toContain("SECRET_BODY");
  });
});
