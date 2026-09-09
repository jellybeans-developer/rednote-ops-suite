import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("configuration", () => {
  it("defaults to loopback", () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(3210);
  });

  it("refuses public binding without a strong token", () => {
    expect(() => loadConfig({ REDNOTE_HOST: "0.0.0.0" } as NodeJS.ProcessEnv)).toThrow(/TOKEN/);
    expect(() => loadConfig({ REDNOTE_HOST: "0.0.0.0", REDNOTE_MCP_TOKEN: "short" } as NodeJS.ProcessEnv)).toThrow(/TOKEN/);
  });

  it("allows public binding with a long token", () => {
    const config = loadConfig({ REDNOTE_HOST: "0.0.0.0", REDNOTE_MCP_TOKEN: "x".repeat(32) } as NodeJS.ProcessEnv);
    expect(config.host).toBe("0.0.0.0");
  });
});
