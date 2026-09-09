import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

export interface PendingDeviceAuthorization {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  intervalSeconds: number;
  expiresAt: string;
}

export interface OfficialOauthSession {
  openId: string;
  scope: string[];
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
}

export interface OfficialOauthStoreShape {
  schemaVersion: 1;
  pendingDeviceAuthorization?: PendingDeviceAuthorization;
  session?: OfficialOauthSession;
}

const EMPTY_STORE: OfficialOauthStoreShape = { schemaVersion: 1 };

export class OfficialOauthTokenStore {
  readonly filePath: string;

  constructor(dataDir: string) {
    this.filePath = join(dataDir, "openaccount-oauth.json");
  }

  async read(): Promise<OfficialOauthStoreShape> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8")) as OfficialOauthStoreShape;
      if (parsed.schemaVersion !== 1) {
        throw new Error("Unsupported official OAuth store schema");
      }
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ...EMPTY_STORE };
      throw error;
    }
  }

  async write(next: OfficialOauthStoreShape): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
    const tempPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(tempPath, this.filePath);
  }

  async clear(): Promise<void> {
    await this.write({ schemaVersion: 1 });
  }
}
