import { cp, mkdir, readFile, writeFile, rm, readdir, symlink } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stage = path.join(root, ".consumer-build");
const output = path.join(root, "out");
// Fixed descendants only: never recursively remove an arbitrary supplied path.
for (const target of [stage, output]) {
  if (path.dirname(target) !== root) throw new Error("Invalid build directory.");
  await rm(target, { recursive: true, force: true });
}
await mkdir(stage, { recursive: true });
await import("./package-data.mjs");
await cp(path.join(root, "src"), path.join(stage, "src"), { recursive: true, filter: (file) => {
  const relative = path.relative(path.join(root, "src"), file).split(path.sep).join("/");
  if (relative === "proxy.ts" || relative === "tests" || relative.startsWith("tests/")) return false;
  if (relative.startsWith("app/")) return ["page.tsx", "layout.tsx", "globals.css", "dictionary", "about"].some((name) => relative === `app/${name}` || relative.startsWith(`app/${name}/`));
  return true;
} });
await cp(path.join(root, "public"), path.join(stage, "public"), { recursive: true });
for (const file of ["package.json", "tsconfig.json", "postcss.config.mjs", "tailwind.config.ts"]) await cp(path.join(root, file), path.join(stage, file));
await mkdir(path.join(stage, "scripts"), { recursive: true });
// Type checking includes existing local review modules; these files are never public entry points.
for (const file of ["feedback-store.mjs", "feedback-store.d.mts"]) await cp(path.join(root, "scripts", file), path.join(stage, "scripts", file));
await symlink(path.join(root, "node_modules"), path.join(stage, "node_modules"), process.platform === "win32" ? "junction" : "dir");
const serviceOrigin = process.env.NEXT_PUBLIC_SERVICE_ORIGIN ?? "";
if (serviceOrigin && !/^https:\/\/[^/]+$/u.test(serviceOrigin)) throw new Error("NEXT_PUBLIC_SERVICE_ORIGIN must be an HTTPS origin without a trailing path.");
// Base path for subpath hosting (e.g. GitHub Pages project sites). Empty = site root.
const basePath = process.env.BASE_PATH ?? "";
if (basePath && !/^\/[A-Za-z0-9_-]+$/u.test(basePath)) throw new Error("BASE_PATH must look like /repo-name (no trailing slash) or be empty.");
await writeFile(path.join(stage, "next.config.mjs"), `export default { output: "export", trailingSlash: true, images: { unoptimized: true }, poweredByHeader: false, turbopack: { root: ${JSON.stringify(root)} }, basePath: ${JSON.stringify(basePath)}, assetPrefix: ${JSON.stringify(basePath)}, env: { NEXT_PUBLIC_OWNER_WORKSPACE: "0", NEXT_PUBLIC_SERVICE_ORIGIN: ${JSON.stringify(serviceOrigin)}, NEXT_PUBLIC_BASE_PATH: ${JSON.stringify(basePath)} } };\n`);
await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "build", "--webpack"], { cwd: stage, stdio: "inherit", env: { ...process.env, NEXT_PUBLIC_OWNER_WORKSPACE: "0", NEXT_PUBLIC_SERVICE_ORIGIN: serviceOrigin, NEXT_PUBLIC_BASE_PATH: basePath } });
  child.on("error", reject); child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Consumer build failed (${code}).`)));
});
await cp(path.join(stage, "out"), output, { recursive: true });
if (basePath) {
  // PWA manifest icon srcs are stored absolute in the source; point them under the base path.
  const manifestPath = path.join(output, "manifest.webmanifest");
  await writeFile(manifestPath, (await readFile(manifestPath, "utf8")).replaceAll('"/icons/', `"${basePath}/icons/`));
}
async function assets(directory, prefix = "") {
  const result = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const name = `${prefix}/${item.name}`;
    if (item.isDirectory()) result.push(...await assets(path.join(directory, item.name), name));
    else if (!name.endsWith(".map")) result.push(name);
  }
  return result;
}
const files = (await assets(output)).map((file) => basePath + file);
const version = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")).version;
const buildVersion = `${version}-${Date.now()}`;
await writeFile(path.join(output, "sw.js"), `/* Build ${buildVersion} */\n${await readFile(path.join(output, "sw.js"), "utf8")}`);
await writeFile(path.join(output, "offline-assets.json"), JSON.stringify({ version: buildVersion, assets: [...files, `${basePath}/`, `${basePath}/dictionary/`, `${basePath}/about/`] }));
for (const route of ["review", "feedback", "diagnostics", "rules", "api", "history"]) {
  if (files.some((file) => file.startsWith(`${basePath}/${route}/`))) throw new Error(`Owner route leaked into consumer build: ${route}`);
}
console.log(`Consumer frontend exported to ${output}. ${files.length} bundled assets; owner routes excluded.`);
