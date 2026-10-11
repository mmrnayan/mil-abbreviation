import { describe, it, expect } from "vitest";
import { mkdtemp, readdir, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createCollector } from "../../scripts/collector.mjs";
import { storeReport, readReports } from "../../scripts/feedback-store.mjs";
describe("public collector boundary", () => {
  it("stores simultaneous retries once, preserves legacy evidence and excludes owner APIs", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sac-collector-"));
    const payload = { id: "stable-report-0001", category: "incorrect-conversion", message: "word is wrong" };
    try {
      const responses = await Promise.all(Array.from({ length: 8 }, () => storeReport(dir, payload)));
      expect(new Set(responses.map((r) => r.receipt)).size).toBe(1);
      expect((await readdir(path.join(dir, "reports"))).filter((s) => s.endsWith(".json"))).toHaveLength(1);
      await writeFile(path.join(dir, "feedback.jsonl"), JSON.stringify({ id: "old-report", message: "old" }) + "\n");
      expect(await readReports(dir)).toHaveLength(2);
      await mkdir(path.join(dir, "web")); await writeFile(path.join(dir, "web/index.html"), "Consumer");
      const server = createCollector({ webRoot: path.join(dir, "web"), dataDirectory: dir, datasetFile: path.join(dir, "dataset.json") });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      try {
        const address = server.address() as { port: number };
        const origin = `http://127.0.0.1:${address.port}`;
        for (const route of ["/api/feedback", "/api/corrections", "/review", "/diagnostics"]) expect((await fetch(origin + route)).status).toBe(404);
        const response = await fetch(origin + "/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        expect(await response.json()).toMatchObject({ ok: true, id: payload.id });
        expect((await fetch(origin + "/")).status).toBe(200);
      } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
