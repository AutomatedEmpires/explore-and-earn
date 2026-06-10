import { readdir, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const appServerDir = path.join(repoRoot, "apps", "web", ".next", "server", "app");

const manifestTemplate = {
  moduleLoading: { prefix: "/_next/" },
  ssrModuleMapping: {},
  edgeSSRModuleMapping: {},
  clientModules: {},
  entryCSSFiles: {},
  rscModuleMapping: {},
  edgeRscModuleMapping: {},
};

async function* walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      yield* walk(entryPath);
      continue;
    }

    yield entryPath;
  }
}

function routeKeyForManifest(manifestPath) {
  const relativePath = path.relative(appServerDir, manifestPath).split(path.sep).join("/");
  return `/${relativePath.replace(/_client-reference-manifest\.js$/, "")}`;
}

async function repairManifest(tracePath) {
  const trace = JSON.parse(await readFile(tracePath, "utf8"));

  if (!trace.files.some((filePath) => filePath.endsWith("_client-reference-manifest.js"))) {
    return false;
  }

  const manifestPath = tracePath.replace(/\.js\.nft\.json$/, "_client-reference-manifest.js");

  try {
    await readFile(manifestPath, "utf8");
    return false;
  } catch {
    await mkdir(path.dirname(manifestPath), { recursive: true });
    const manifestKey = routeKeyForManifest(manifestPath);
    const manifestSource =
      "globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});" +
      `globalThis.__RSC_MANIFEST[${JSON.stringify(manifestKey)}]=${JSON.stringify(manifestTemplate)};\n`;
    await writeFile(manifestPath, manifestSource, "utf8");
    return true;
  }
}

let repairedCount = 0;

for await (const entryPath of walk(appServerDir)) {
  if (!entryPath.endsWith(".js.nft.json")) {
    continue;
  }

  if (await repairManifest(entryPath)) {
    repairedCount += 1;
  }
}

if (repairedCount > 0) {
  console.log(`repair-client-reference-manifests: created ${repairedCount} placeholder manifest(s)`);
}