import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PRODUCTION_PROJECT_REF, assertStagingEnvironment } from "./lib.mjs";

const { projectRef } = assertStagingEnvironment({ requireServiceKey: false });
const outputFlag = process.argv.indexOf("--output");
if (outputFlag < 0 || !process.argv[outputFlag + 1]) {
  throw new Error("Usage: node prepare-vercel-config.mjs --output <new-file.json>");
}
const sourcePath = resolve(import.meta.dirname, "../../vercel.json");
const outputPath = resolve(process.argv[outputFlag + 1]);
if (outputPath === sourcePath) throw new Error("Refusing to overwrite the production Vercel config");

const source = await readFile(sourcePath, "utf8");
if (!source.includes(PRODUCTION_PROJECT_REF)) {
  throw new Error("Expected production CSP marker was not found; review vercel.json before staging deployment");
}
const prepared = source.replaceAll(PRODUCTION_PROJECT_REF, projectRef);
if (prepared.includes(PRODUCTION_PROJECT_REF)) throw new Error("Production ref remains in prepared config");
await writeFile(outputPath, prepared, { encoding: "utf8", flag: "wx" });
console.log(`Prepared staging-only Vercel config: ${outputPath}`);
