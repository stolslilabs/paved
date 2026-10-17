/**
 * The exact Vercel build of a project, run here (GUARDS, P-71): the `installCommand` and `buildCommand` of its
 * vercel.json, from its root directory, with the Sepolia build env of packages/app/vercel.json. `bun run check` and the
 * CI job "Vercel build (Sepolia)" run it, so a Vercel break shows before the merge, not on main.
 *
 *   node scripts/check/vercel-build.mts <client|storybook> [--no-install]
 *
 * - client: packages/app/vercel.json, run from packages/app (the project's root directory on Vercel).
 * - storybook: the root vercel.json, run from the repository root.
 *
 * It needs no secret: the env is the public `build.env` of packages/app/vercel.json (network, indexer and RPC URLs).
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export interface VercelProject {
  name: "client" | "storybook";
  /** The project's root directory, from the repository root. */
  dir: string;
}
export const PROJECTS: Record<VercelProject["name"], VercelProject> = {
  client: { name: "client", dir: "packages/app" },
  storybook: { name: "storybook", dir: "." },
};

interface VercelJson {
  installCommand?: string;
  buildCommand?: string;
  build?: { env?: Record<string, string> };
}
const readVercel = (dir: string): VercelJson => JSON.parse(readFileSync(join(ROOT, dir, "vercel.json"), "utf8")) as VercelJson;

/** The Sepolia build env: the `build.env` of the client's vercel.json, which both projects build with. */
export const sepoliaEnv = (): Record<string, string> => readVercel(PROJECTS.client.dir).build?.env ?? {};

/** The commands of a project, in order: install, then build. */
export function commands(project: VercelProject, install = true): string[] {
  const json = readVercel(project.dir);
  if (!json.buildCommand) throw new Error(`${project.dir}/vercel.json has no buildCommand`);
  return [...(install && json.installCommand ? [json.installCommand] : []), json.buildCommand];
}

/** Runs the project's commands with `sh -c` (as Vercel does), output streamed; returns the first non-zero exit. */
export function vercelBuild(project: VercelProject, install = true): number {
  const env = { ...process.env, ...sepoliaEnv() };
  for (const command of commands(project, install)) {
    console.log(`[vercel-build ${project.name}] (${project.dir}) ${command}`);
    const run = spawnSync("sh", ["-c", command], { cwd: join(ROOT, project.dir), env, stdio: "inherit" });
    const code = run.status ?? 1;
    if (code !== 0) return code;
  }
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const name = process.argv[2] as VercelProject["name"];
  const project = PROJECTS[name];
  if (!project) {
    console.error("usage: node scripts/check/vercel-build.mts <client|storybook> [--no-install]");
    process.exit(2);
  }
  process.exit(vercelBuild(project, !process.argv.includes("--no-install")));
}
