import { cp, mkdir, readFile, stat, writeFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kind = process.argv[2];
if (!["windows", "mobile"].includes(kind)) throw new Error("Choose windows or mobile.");
await stat(path.join(root, "out/index.html"));
const folder = path.join(root, "platforms", kind === "windows" ? "electron-win" : "capacitor-mobile");
const assets = path.resolve(folder, "www");
if (path.dirname(assets) !== folder || !folder.startsWith(root + path.sep)) throw new Error("Invalid packaging directory.");
await rm(assets, { recursive: true, force: true });
await mkdir(assets, { recursive: true });
await cp(path.join(root, "out"), assets, { recursive: true });
async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: folder, stdio: "inherit", env: process.env });
    child.on("error", reject); child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Packaging failed (${code}).`)));
  });
}
if (kind === "windows") {
  const version = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")).version;
  const pkg = JSON.parse(await readFile(path.join(folder, "package.json"), "utf8"));
  if (pkg.version !== version) throw new Error("Desktop version does not match the app version.");
  await run(process.execPath, ["node_modules/electron-builder/cli.js", "--win", "--x64"]);
} else {
  for (const platform of ["android", "ios"]) {
    if (!(await stat(path.join(folder, platform)).catch(() => undefined))) await run(process.execPath, ["node_modules/@capacitor/cli/bin/capacitor", "add", platform]);
    await run(process.execPath, ["node_modules/@capacitor/cli/bin/capacitor", "sync", platform]);
  }
  const version = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")).version;
  const [major, minor, patch] = version.split(".").map(Number);
  const code = major * 10000 + minor * 100 + patch;
  const android = path.join(folder, "android/app/build.gradle");
  await writeFile(android, (await readFile(android, "utf8")).replace(/versionCode \d+/u, `versionCode ${code}`).replace(/versionName "[^"]+"/u, `versionName "${version}"`));
  const ios = path.join(folder, "ios/App/App.xcodeproj/project.pbxproj");
  await writeFile(ios, (await readFile(ios, "utf8")).replace(/CURRENT_PROJECT_VERSION = \d+;/gu, `CURRENT_PROJECT_VERSION = ${code};`).replace(/MARKETING_VERSION = [\d.]+;/gu, `MARKETING_VERSION = ${version};`));
  console.log("Android and iOS native projects contain the complete offline app. Build Android with Gradle and iOS with Xcode/signing on a Mac.");
}
