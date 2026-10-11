import { readFile, writeFile, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = async (file) => JSON.parse(await readFile(path.join(root, file), "utf8"));
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  return JSON.stringify(value);
}
const layers = { base: await read("public/data/abbreviations.base.json"), rules: await read("public/data/abbreviation-rules.json"), overrides: await read("public/data/abbreviation-overrides.json") };
const digest = createHash("sha256").update(canonical(layers)).digest("hex");
const pkg = { format: "sac-dataset-v1", version: `${layers.base.generated_on}-${digest.slice(0, 12)}`, engineVersion: (await read("package.json")).version, digest, layers };
const validationModule = await build({ entryPoints: [path.join(root, "src/utils/datasetPackage.ts")], bundle: true, platform: "node", format: "esm", write: false, tsconfig: path.join(root, "tsconfig.json") });
const { validatePackage } = await import(`data:text/javascript;base64,${Buffer.from(validationModule.outputFiles[0].text).toString("base64")}`);
await validatePackage(pkg);
const target = path.join(root, "public/data/dataset-package.json");
await writeFile(target + ".tmp", JSON.stringify(pkg));
await rename(target + ".tmp", target);
console.log(`Packaged dataset ${pkg.version}`);
