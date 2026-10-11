import type { Server } from "node:http";
export function createCollector(options?: { webRoot?: string; dataDirectory?: string; datasetFile?: string }): Server;
