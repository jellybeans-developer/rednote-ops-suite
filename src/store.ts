import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { AuditEvent, ContentDraft, DatabaseShape, MetricSnapshot } from "./types.js";

const EMPTY_DB: DatabaseShape = { schemaVersion: 1, drafts: [], metrics: [] };

export class JsonStore {
  readonly dbPath: string;
  readonly auditPath: string;
  private static queues = new Map<string, Promise<unknown>>();

  constructor(private readonly dataDir: string) {
    this.dbPath = join(dataDir, "data.json");
    this.auditPath = join(dataDir, "audit.jsonl");
  }

  async init(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true, mode: 0o700 });
    try {
      await readFile(this.dbPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await this.write(EMPTY_DB);
    }
  }

  async read(): Promise<DatabaseShape> {
    const parsed = JSON.parse(await readFile(this.dbPath, "utf8")) as DatabaseShape;
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.drafts) || !Array.isArray(parsed.metrics)) {
      throw new Error("Unsupported or corrupt data file");
    }
    return parsed;
  }

  async transaction<T>(operation: (db: DatabaseShape) => T | Promise<T>): Promise<T> {
    const next = (JsonStore.queues.get(this.dbPath) ?? Promise.resolve()).then(async () => {
      const db = await this.read();
      const result = await operation(db);
      await this.write(db);
      return result;
    });
    JsonStore.queues.set(this.dbPath, next.catch(() => undefined));
    return next;
  }

  async listDrafts(): Promise<ContentDraft[]> {
    return (await this.read()).drafts;
  }

  async getDraft(id: string): Promise<ContentDraft | undefined> {
    return (await this.read()).drafts.find((draft) => draft.id === id);
  }

  async addDraft(draft: ContentDraft): Promise<void> {
    await this.transaction((db) => { db.drafts.push(draft); });
  }

  async updateDraft(id: string, update: (draft: ContentDraft) => void): Promise<ContentDraft> {
    return this.transaction((db) => {
      const draft = db.drafts.find((item) => item.id === id);
      if (!draft) throw new Error(`Draft not found: ${id}`);
      update(draft);
      draft.updatedAt = new Date().toISOString();
      return draft;
    });
  }

  async addMetric(metric: MetricSnapshot): Promise<void> {
    await this.transaction((db) => { db.metrics.push(metric); });
  }

  async audit(action: string, outcome: AuditEvent["outcome"], entityId?: string, details?: Record<string, unknown>): Promise<void> {
    const event: AuditEvent = { id: randomUUID(), at: new Date().toISOString(), action, outcome, entityId, details };
    await appendFile(this.auditPath, `${JSON.stringify(event)}\n`, { encoding: "utf8", mode: 0o600 });
  }

  private async write(db: DatabaseShape): Promise<void> {
    const tempPath = `${this.dbPath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(db, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(tempPath, this.dbPath);
  }
}
