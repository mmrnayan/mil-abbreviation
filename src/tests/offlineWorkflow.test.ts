import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { mapSelection } from "@/utils/reportSelection";
import { buildConversionFeedback, readConversionFeedbackContext } from "@/utils/conversionFeedback";
import { enqueueReport, listReports, deliverReports, retryReport, cancelReport, importOutbox, type SubmittedReport } from "@/utils/reportOutbox";
import { packageDigest, validatePackage, type DatasetPackage } from "@/utils/datasetPackage";
import { installDataset, DATASET_SNAPSHOT_KEY, type DatasetSnapshot } from "@/utils/datasetUpdates";
import { readLocal, writeLocal } from "@/utils/localStore";
import { diagnoseReport } from "@/utils/reportDiagnosis";
import { composeRulesOverlay } from "@/engine/datasetLayers";
import bundled from "../../public/data/dataset-package.json";
import { engine, dataset } from "./testDataset";

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("localStorage", { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) });
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("window", Object.assign(new EventTarget(), { location: { protocol: "http:" } }));
});
const report = (id = "test-report-0001"): SubmittedReport => ({ id, createdAt: "2026-10-10T00:00:00Z", category: "incorrect-conversion", message: "Selected word reported", context: buildConversionFeedback({ result: engine.convertForward("deploy") }).context });
const ack = (id: string) => new Response(JSON.stringify({ ok: true, id, receipt: `report:${id}` }), { status: 200 });

describe("selection mapping and sentence minimization", () => {
  it("maps the second repeated changed word without choosing the first", () => {
    const result = engine.convertForward("They deployed. They deployed again. Private third sentence.");
    const offset = result.convertedText.lastIndexOf("depl");
    const selection = mapSelection(result, { start: offset + 1, end: offset + 3 }, "output");
    expect(result.originalText.slice(selection.source.start, selection.source.end)).toBe("deployed");
    const context = buildConversionFeedback({ result, selection }).context;
    expect(context.input).toBe("They deployed again.");
    expect(JSON.stringify(context)).not.toContain("Private third");
    expect(context.selected?.source.start).toBe(5);
  });
  it("maps an unchanged word after length-changing replacements", () => {
    const result = engine.convertForward("They deployed butterflies yesterday.");
    const start = result.convertedText.indexOf("butterflies");
    const selection = mapSelection(result, { start, end: start + 11 }, "output");
    expect(result.originalText.slice(selection.source.start, selection.source.end)).toBe("butterflies");
  });
  it("preserves a multiword selection spanning changed and unchanged text", () => {
    const result = engine.convertForward("They deployed butterflies.");
    const start = result.originalText.indexOf("deployed");
    const selection = mapSelection(result, { start, end: result.originalText.length - 1 }, "source");
    const context = buildConversionFeedback({ result, selection }, "depl butterflies").context;
    expect(context.selectedText).toBe("deployed butterflies");
    expect(context.expected).toBe("They depl butterflies.");
  });
  it("keeps legacy Settings reports readable without an expected form", () => {
    expect(readConversionFeedbackContext({ input: "deploy", actualOutput: "depl", expectedOutput: null, direction: "full-to-abbreviation" })?.actual).toBe("depl");
  });
});

describe("durable delivery", () => {
  it("resumes a sending record left behind by an interrupted process", async () => {
    await enqueueReport(report());
    await writeLocal("report-outbox-v2", [{ report: report(), status: "sending", attempts: 1 }]);
    await deliverReports(vi.fn().mockResolvedValue(ack(report().id)));
    expect((await listReports())[0]).toMatchObject({ status: "sent", attempts: 2 });
  });
  it("commits to IndexedDB, recovers a failed request and acknowledges a retry", async () => {
    await enqueueReport(report());
    expect((await listReports())[0].status).toBe("waiting");
    await deliverReports(vi.fn().mockRejectedValue(new Error("Disconnected")));
    const failed = (await listReports())[0];
    expect(failed.status).toBe("waiting"); expect(failed.error).toBe("Disconnected");
    await retryReport(failed.report.id);
    await deliverReports(vi.fn().mockResolvedValue(ack(failed.report.id)));
    expect((await listReports())[0]).toMatchObject({ status: "sent", receipt: "report:test-report-0001" });
  });
  it("does not mark a missing or wrong acknowledgement as sent", async () => {
    await enqueueReport(report());
    await deliverReports(vi.fn().mockResolvedValue(ack("different-id")));
    expect((await listReports())[0].status).toBe("waiting");
  });
  it("retains permanent rejections visibly and allows cancellation", async () => {
    await enqueueReport(report());
    await deliverReports(vi.fn().mockResolvedValue(new Response("bad", { status: 400 })));
    expect((await listReports())[0].status).toBe("attention");
    await cancelReport(report().id); expect(await listReports()).toEqual([]);
  });
  it("imports exports idempotently and preserves sent receipts", async () => {
    await enqueueReport(report());
    await deliverReports(vi.fn().mockResolvedValue(ack(report().id)));
    const json = JSON.stringify(await listReports());
    expect(await importOutbox(json)).toBe(0);
    await enqueueReport(report("test-report-0002"));
    expect((await listReports()).length).toBe(2);
  });
});

describe("atomic datasets and diagnosis", () => {
  const pkg = bundled as unknown as DatasetPackage;
  it("captures a selected ambiguous meaning and reproduces it in sentence checks", () => {
    const choices = engine.convertReverse("AAR").ambiguities[0].choices;
    const choice = choices.find((c) => c.meaning === "Air to Air Refuelling")!;
    const result = engine.convertReverse("AAR", { resolutions: { "all:aar": choice.id, "all:AAR": choice.id } });
    const context = buildConversionFeedback({ result, datasetVersion: pkg.version }).context;
    const overlay = composeRulesOverlay(pkg.layers.rules, pkg.layers.overrides, dataset);
    const diagnosis = diagnoseReport(context, dataset, overlay, pkg.version);
    expect(diagnosis.checks.find((c) => c.label === "Selected word alone")?.matches.length).toBeGreaterThan(1);
    expect(diagnosis.checks.find((c) => c.label === "Word in reported sentence")?.output).toBe("Air to Air Refuelling");
  });
  it("validates the complete bundle and rejects changed bytes and incompatible engines", async () => {
    expect(await validatePackage(pkg)).toBe(pkg);
    const bad = structuredClone(pkg); bad.layers.base.entries[0].abbreviation = "bad";
    await expect(validatePackage(bad)).rejects.toThrow("integrity");
    await expect(validatePackage({ ...pkg, engineVersion: "999" })).rejects.toThrow("different app");
  });
  it("retains the complete working dataset when the next update is invalid", async () => {
    const next = structuredClone(pkg); next.layers.base.entries[0].note = "Reviewed update example";
    next.digest = await packageDigest(next.layers); next.version = "test-update";
    await installDataset(next, pkg);
    const snapshot = await readLocal<DatasetSnapshot>(DATASET_SNAPSHOT_KEY);
    expect(snapshot?.previous?.digest).toBe(pkg.digest);
    const broken = structuredClone(next); broken.layers.rules.rules = [];
    await expect(installDataset(broken, pkg)).rejects.toThrow();
    expect((await readLocal<DatasetSnapshot>(DATASET_SNAPSHOT_KEY))?.current.digest).toBe(next.digest);
    await enqueueReport(report()); expect((await listReports()).length).toBe(1);
  });
  it("compares approved derivative forms and leaves unknown words for source review", () => {
    const overlay = composeRulesOverlay(pkg.layers.rules, pkg.layers.overrides, dataset);
    const context = buildConversionFeedback({ result: engine.convertForward("deployed"), datasetVersion: pkg.version }).context;
    const diagnosis = diagnoseReport(context, dataset, overlay, pkg.version);
    expect(diagnosis.root).toBe("deploy");
    expect(diagnosis.checks.some((c) => c.input === "deployment" && c.output === "depl")).toBe(true);
    const unknown = buildConversionFeedback({ result: engine.convertForward("butterflies") }).context;
    expect(diagnoseReport(unknown, dataset, overlay, pkg.version).status).toBe("Needs source review");
  });
});
