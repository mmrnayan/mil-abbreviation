import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { storeReport } from "./feedback-store.mjs";
import { staticFile } from "./static-server.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export function createCollector({ webRoot = path.join(root, "out"), dataDirectory = path.join(root, "data"), datasetFile = path.join(root, "public/data/dataset-package.json") } = {}) {
  return http.createServer(async (req, res) => {
    // Native secure origins and website clients can submit without cookies or credentials.
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const pathname = new URL(req.url ?? "/", "http://collector.local").pathname;
    const json = (status, data) => { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(data)); };
    if (req.method === "OPTIONS" && pathname === "/api/feedback") { res.writeHead(204); res.end(); return; }
    if (pathname === "/api/feedback" && req.method === "POST") {
      try {
        const chunks = []; let length = 0;
        for await (const chunk of req) { length += chunk.length; if (length > 256 * 1024) { json(413, { ok: false, error: "Report too large." }); return; } chunks.push(chunk); }
        let payload;
        try { payload = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { json(400, { ok: false, error: "Invalid JSON." }); return; }
        try { json(200, await storeReport(dataDirectory, payload)); }
        catch (cause) { json(cause.code ? 500 : 400, { ok: false, error: cause.code ? "Report storage unavailable." : cause.message }); }
      } catch { if (!res.writableEnded) json(500, { ok: false, error: "Report storage unavailable." }); }
      return;
    }
    if (pathname.startsWith("/api/") || ["/review", "/feedback", "/diagnostics", "/rules"].some((r) => pathname === r || pathname.startsWith(r + "/"))) { json(404, { ok: false }); return; }
    if (req.method !== "GET" && req.method !== "HEAD") { json(405, { ok: false }); return; }
    if (pathname === "/data/dataset-package.json") {
      try { const body = await readFile(datasetFile); res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(req.method === "HEAD" ? undefined : body); } catch { json(503, { ok: false, error: "Approved dataset unavailable." }); }
      return;
    }
    const asset = await staticFile(webRoot, pathname);
    if (!asset) { json(404, { ok: false }); return; }
    res.writeHead(200, { "Content-Type": asset.contentType, "Cache-Control": pathname.includes("/_next/") ? "public, max-age=31536000, immutable" : "no-cache" }); res.end(req.method === "HEAD" ? undefined : asset.body);
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createCollector();
  server.listen(Number(process.env.PORT ?? 3108), process.env.HOST ?? "127.0.0.1", () => console.log(`Consumer app and collector on ${process.env.HOST ?? "127.0.0.1"}:${process.env.PORT ?? 3108}`));
}
