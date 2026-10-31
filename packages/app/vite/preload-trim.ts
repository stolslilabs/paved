import type { Plugin, Rollup } from "vite";

/**
 * The preload lists without what is loaded already (#952, the first load's budget). For each lazy `import()`, Vite writes the
 * list of the chunks to fetch with it (`__vite__mapDeps`), every chunk the target needs, the ones the importing chunk itself
 * imports statically included. Those are loaded and run before the importing chunk runs, so the `import()` can never need to
 * fetch them: listing them only grows the importing chunk (the entry's page loaders above all). Here each list leaves out the
 * importing chunk's static imports, all the way down; what the browser fetches does not change.
 *
 * The lists are written in `vite:build-import-analysis`'s `generateBundle`; this plugin's runs first (`order: "pre"`) and keeps
 * the bundle, which `resolveDependencies` reads. Without it (a hook order Vite would change), every list stays whole.
 */
export function preloadTrim(): Plugin {
  let bundle: Rollup.OutputBundle | null = null;
  const loaded = new Map<string, Set<string>>();
  /** The chunks `file` imports statically, all the way down. */
  const staticClosure = (file: string): Set<string> => {
    const known = loaded.get(file);
    if (known) return known;
    const seen = new Set<string>();
    const walk = (name: string) => {
      const chunk = bundle?.[name];
      if (!chunk || chunk.type !== "chunk") return;
      for (const imported of chunk.imports) {
        if (seen.has(imported)) continue;
        seen.add(imported);
        walk(imported);
      }
    };
    walk(file);
    loaded.set(file, seen);
    return seen;
  };
  return {
    name: "paved:preload-trim",
    apply: "build",
    config: () => ({
      build: {
        modulePreload: {
          resolveDependencies: (_file, deps, { hostId, hostType }) => {
            if (!bundle || hostType !== "js") return deps;
            const have = staticClosure(hostId);
            return deps.filter((dep) => !have.has(dep));
          },
        },
      },
    }),
    generateBundle: {
      order: "pre",
      handler(_options, output) {
        bundle = output;
        loaded.clear();
      },
    },
  };
}
