#!/usr/bin/env node
import { createServer } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { loadConfig } from "./config.js";
import { createRedNoteServer } from "./server.js";

function hasValidToken(header: string | undefined, expected: string | undefined): boolean {
  if (!expected) return true;
  if (!header?.startsWith("Bearer ")) return false;
  const actual = Buffer.from(header.slice(7));
  const wanted = Buffer.from(expected);
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

async function runStdio(): Promise<void> {
  const config = loadConfig();
  const server = await createRedNoteServer(config);
  await server.connect(new StdioServerTransport());
  console.error("rednote-ops MCP running over stdio");
}

async function runHttp(): Promise<void> {
  const config = loadConfig();
  const initialServer = await createRedNoteServer(config);
  await initialServer.close();
  const sessions = new Map<string, StreamableHTTPServerTransport>();
  const httpServer = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      if (req.method === "GET" && url.pathname === "/healthz") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, service: "rednote-ops" }));
        return;
      }
      if (url.pathname !== "/mcp") {
        res.writeHead(404).end("Not found");
        return;
      }
      if (!hasValidToken(req.headers.authorization, config.httpToken)) {
        res.writeHead(401, { "www-authenticate": "Bearer", "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }

      const body = await new Promise<unknown>((resolveBody, reject) => {
        let raw = "";
        req.setEncoding("utf8");
        req.on("data", (chunk) => {
          raw += chunk;
          if (raw.length > 1_000_000) reject(new Error("Request too large"));
        });
        req.on("end", () => {
          try { resolveBody(raw ? JSON.parse(raw) : undefined); }
          catch { reject(new Error("Invalid JSON")); }
        });
        req.on("error", reject);
      });
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      let transport = sessionId ? sessions.get(sessionId) : undefined;

      if (!transport && req.method === "POST" && isInitializeRequest(body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => { sessions.set(id, transport!); },
        });
        transport.onclose = () => {
          if (transport?.sessionId) sessions.delete(transport.sessionId);
        };
        const server = await createRedNoteServer(config);
        await server.connect(transport);
      }
      if (!transport) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Missing or invalid MCP session" }));
        return;
      }
      await transport.handleRequest(req, res, body);
    } catch (error) {
      if (!res.headersSent) res.writeHead((error as Error).message === "Invalid JSON" ? 400 : 500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: (error as Error).message }));
    }
  });

  httpServer.listen(config.port, config.host, () => {
    console.error(`rednote-ops MCP listening on http://${config.host}:${config.port}/mcp`);
  });
}

const mode = process.argv.includes("--http") ? "http" : "stdio";
(mode === "http" ? runHttp() : runStdio()).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
