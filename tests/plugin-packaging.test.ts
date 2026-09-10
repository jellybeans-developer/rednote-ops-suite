import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CORE_MCP_TOOL_NAMES, PACKAGE_VERSION } from "../src/mcp-tool-names.js";

const root = process.cwd();

async function readJson(relativePath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(root, relativePath), "utf8")) as Record<string, unknown>;
}

describe("plugin packaging", () => {
  it("ships aligned Agent Plugin and Cursor plugin manifests without secrets", async () => {
    const pkg = await readJson("package.json");
    const plugin = await readJson("plugin.json");
    const grokPlugin = await readJson(".grok-plugin/plugin.json");
    const grokMarketplace = await readJson(".grok-plugin/marketplace.json");
    const grokMcp = await readJson(".mcp.json");
    const cursorPlugin = await readJson(".cursor-plugin/plugin.json");
    const mcp = await readJson("mcp.json");
    const listing = await readJson("grokbot/manifest.json");

    expect(pkg.version).toBe(PACKAGE_VERSION);
    expect(plugin.version).toBe(PACKAGE_VERSION);
    expect(grokPlugin.version).toBe(PACKAGE_VERSION);
    expect(cursorPlugin.version).toBe(PACKAGE_VERSION);
    expect(listing.version).toBe(PACKAGE_VERSION);
    expect((grokMarketplace.plugins as Array<{ version: string }>)[0]?.version).toBe(PACKAGE_VERSION);
    expect(plugin.$schema).toBe("https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
    expect(plugin.name).toBe("rednote-ops-suite");
    expect(cursorPlugin.name).toBe("rednote-ops-suite");
    expect(grokPlugin.name).toBe("rednote-ops-suite");

    expect(mcp.$schema).toBe("https://agent-plugins.org/schemas/1.0.0/mcp.schema.json");
    const servers = mcp.mcpServers as { rednote_ops: { type: string; command: string; args: string[] } };
    expect(servers.rednote_ops.type).toBe("stdio");
    expect(servers.rednote_ops.command).toBe("node");
    expect(servers.rednote_ops.args).toEqual(["dist/cli.js"]);
    expect(JSON.stringify(mcp)).not.toMatch(/Bearer |app_secret|sk_/i);

    const grokServers = grokMcp.mcpServers as {
      rednote_ops: { type: string; command: string; args: string[]; cwd: string; env: Record<string, string> };
    };
    expect(grokServers.rednote_ops.type).toBe("stdio");
    expect(grokServers.rednote_ops.command).toBe("node");
    expect(grokServers.rednote_ops.args).toEqual(["plugin-dist/index.js"]);
    expect(grokServers.rednote_ops.cwd).toBe("${GROK_PLUGIN_ROOT}");
    expect(grokServers.rednote_ops.env.REDNOTE_CREATOR_BROWSER_ENABLED).toBe("true");
    expect(grokServers.rednote_ops.env.REDNOTE_CREATOR_ALLOW_PUBLISH).toBe("false");
    expect(JSON.stringify(grokMcp)).not.toMatch(/Bearer |app_secret|sk_/i);

    const requiredTools = (listing.mcp as { requiredTools: string[] }).requiredTools;
    expect(requiredTools).toEqual([...CORE_MCP_TOOL_NAMES]);
  });

  it("includes operator skills for workflow and refusal", async () => {
    const workflow = await readFile(join(root, "skills/rednote-ops-workflow/SKILL.md"), "utf8");
    const safety = await readFile(join(root, "skills/rednote-ops-safety/SKILL.md"), "utf8");
    expect(workflow).toContain("create_publish_package");
    expect(workflow).toContain("OAuth ≠ 发布权限");
    expect(safety).toContain("Cookie");
    expect(safety).toContain("私有 API");
  });

  it("ships a native Grok agent with the guarded publish workflow", async () => {
    const agent = await readFile(join(root, "agents/rednote-operator.md"), "utf8");
    expect(agent).toMatch(/^---\nname: rednote-operator/m);
    expect(agent).toContain("mcpInheritance: all");
    expect(agent).toContain("safety_status");
    expect(agent).toContain("prepare_creator_publish");
    expect(agent).toContain("PUBLISH_TO_XIAOHONGSHU");
    expect(agent).toContain("不得尝试绕过");
  });
});
