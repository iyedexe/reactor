import { readFileSync } from "node:fs";
import { build } from "esbuild";

/**
 * Bundles the worker (and the seed script) with all @avis/* workspace code inlined; third-party
 * packages stay external and come from the `pnpm deploy` node_modules in the image.
 */
const externalizeDeps = {
  name: "externalize-deps",
  setup(b) {
    b.onResolve({ filter: /^[^./]/ }, (args) => {
      // better-auth is only used by the seed (password hashing): inline it rather than ship it.
      if (args.path.startsWith("@avis/") || args.path.startsWith("node:") || /^(better-auth|@better-auth\/|@noble\/|@faker-js\/)/.test(args.path)) return undefined;
      return { path: args.path, external: true };
    });
  },
};

const result = await build({
  metafile: true,
  entryPoints: { index: "src/index.ts", seed: "../../packages/seed/src/index.ts" },
  outdir: "dist",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  plugins: [externalizeDeps],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: "info",
});

// Guard: every external import must be a direct dependency, or it won't exist in the deployed image.
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const missing = new Set();
for (const out of Object.values(result.metafile.outputs)) {
  for (const imp of out.imports) {
    if (!imp.external || imp.path.startsWith("node:")) continue;
    const name = imp.path.startsWith("@") ? imp.path.split("/").slice(0, 2).join("/") : imp.path.split("/")[0];
    if (!pkg.dependencies?.[name]) missing.add(name);
  }
}
if (missing.size) {
  console.error(`Add these to apps/worker/package.json dependencies: ${[...missing].join(", ")}`);
  process.exit(1);
}
