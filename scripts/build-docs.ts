import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { renderDocs } from "../src/docs.js";

const outDir = fileURLToPath(new URL("../docs/", import.meta.url));
await mkdir(outDir, { recursive: true });
await writeFile(`${outDir}index.html`, renderDocs());
await writeFile(`${outDir}.nojekyll`, "");
console.log(`wrote ${outDir}index.html`);
