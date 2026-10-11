import { readFile, stat } from "node:fs/promises";
import path from "node:path";
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".txt": "text/plain", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };
export async function staticFile(root, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return; }
  if (decoded.includes("\\") || decoded.includes("\0")) return;
  let file = path.resolve(root, `.${decoded}`);
  if (file !== root && !file.startsWith(root + path.sep)) return;
  const info = await stat(file).catch(() => undefined);
  if (info?.isDirectory()) file = path.join(file, "index.html");
  try { return { body: await readFile(file), contentType: types[path.extname(file)] ?? "application/octet-stream" }; } catch { return; }
}
