export type DraftStatus = "draft" | "in_review" | "approved" | "ready_to_publish" | "published" | "cancelled";

export interface ContentDraft {
  id: string;
  title: string;
  body: string;
  topics: string[];
  assetPaths: string[];
  campaign?: string;
  scheduledAt?: string;
  status: DraftStatus;
  contentHash: string;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  publishedAt?: string;
  externalPostId?: string;
}

export interface MetricSnapshot {
  id: string;
  draftId: string;
  capturedAt: string;
  views?: number;
  likes?: number;
  comments?: number;
  saves?: number;
  follows?: number;
  source: "manual" | "official_api";
}

export interface AuditEvent {
  id: string;
  at: string;
  action: string;
  entityId?: string;
  outcome: "success" | "denied" | "error";
  details?: Record<string, unknown>;
}

export interface DatabaseShape {
  schemaVersion: 1;
  drafts: ContentDraft[];
  metrics: MetricSnapshot[];
}

export interface ContentCheck {
  level: "error" | "warning" | "info";
  code: string;
  message: string;
}
