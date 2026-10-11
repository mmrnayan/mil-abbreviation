import { readLocal, writeLocal, withLocalLock, initializeLocalStore } from "./localStore";
import { validatePackage, type DatasetPackage } from "./datasetPackage";
export interface DatasetSnapshot { current: DatasetPackage; previous?: DatasetPackage }
export const DATASET_SNAPSHOT_KEY = "dataset-snapshot-v1";
export async function installDataset(value: unknown, bundled: DatasetPackage): Promise<{ current: DatasetPackage; changed: boolean }> {
  const next = await validatePackage(value);
  await initializeLocalStore();
  return withLocalLock("dataset-snapshot", async () => {
    const stored = await readLocal<DatasetSnapshot>(DATASET_SNAPSHOT_KEY);
    const current = stored?.current ? await validatePackage(stored.current).catch(() => bundled) : bundled;
    if (next.digest === current.digest) return { current, changed: false };
    await writeLocal<DatasetSnapshot>(DATASET_SNAPSHOT_KEY, { current: next, previous: current });
    return { current: next, changed: true };
  });
}
