export function normalizeReport(payload: unknown): Record<string, unknown>;
export function storeReport(directory: string, payload: unknown): Promise<{ ok: boolean; id: string; receipt: string }>;
export function readReports(directory: string): Promise<Record<string, unknown>[]>;
