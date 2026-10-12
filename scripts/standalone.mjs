import { build } from "vite";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { parseFamily } from "../src/model.js";

const { values } = parseArgs({
  options: { data: { type: "string" }, out: { type: "string" } },
});
if (!values.out)
  throw new Error(
    "Uveďte --out /cesta/rodokmen.html. Súkromný súbor ukladajte mimo Git repozitára.",
  );
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(values.out);
if (values.data && (output === root || output.startsWith(root + "/")))
  throw new Error(
    "Rodinné údaje musia zostať mimo Git repozitára. Zvoľte inú výstupnú cestu.",
  );
const family = values.data
  ? parseFamily(await readFile(resolve(values.data), "utf8"))
  : parseFamily(
      await readFile(resolve(root, "src/initial-family.json"), "utf8"),
    );
const result = await build({
  configFile: false,
  root,
  logLevel: "warn",
  build: {
    write: false,
    cssCodeSplit: false,
    rollupOptions: {
      input: resolve(root, "src/main.jsx"),
      output: { format: "iife", inlineDynamicImports: true, name: "FamilyApp" },
    },
  },
});
const chunks = result.output.filter((item) => item.type === "chunk");
if (chunks.length !== 1 || chunks[0].imports.length)
  throw new Error(
    "Samostatný súbor musí obsahovať celý JavaScript bez externých modulov.",
  );
const css = result.output
  .filter((item) => item.type === "asset" && item.fileName.endsWith(".css"))
  .map((item) => item.source)
  .join("\n");
const js = chunks[0].code.replace(/<\/script/gi, "<\\/script");
const seed = JSON.stringify(family).replace(/</g, "\\u003c");
const html = `<!doctype html>
<html lang="sk">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#264b3d"><title>Ďurišovci — rodokmeň</title><style>${css.replace(/<\/style/gi, "<\\/style")}</style></head>
<body><div id="root"><noscript>Na zobrazenie rodokmeňa povoľte JavaScript.</noscript></div><script id="family-seed" type="application/json">${seed}</script><script>${js}</script></body>
</html>`;
await mkdir(dirname(output), { recursive: true });
await writeFile(output, html, { mode: 0o600 });
console.log(
  `Samostatný rodokmeň vytvorený: ${output}; ${family.people.length} osôb; bez externých skriptov a štýlov.`,
);
