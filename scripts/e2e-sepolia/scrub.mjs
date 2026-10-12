// Redaction and evidence checks shared by the Sepolia drivers (D-16). No I/O except `checkEvidence`, which only reads.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** URLs lose their query AND fragment (the keychain's connect id and options travel there). */
export const redact = (u) => u.replace(/[?#].*$/, "");

const ECHO = "internal server error";
export const ECHO_CUT = "[the rest of the text is removed: the keychain echoes its registration request after this point]";

/** The name of a GraphQL operation in a raw error text, read before `scrub`; only the name is kept. */
export const operationName = (raw) =>
  (String(raw).match(/"path"\s*:\s*\[\s*"([A-Za-z_][A-Za-z0-9_]*)"/) || String(raw).match(/\bmutation\s+([A-Za-z_][A-Za-z0-9_]*)/) || [])[1] ?? null;

/**
 * Text that may reach a file. Everything after the first "internal server error" is cut: the keychain prints its GraphQL request
 * there, which carries the passkey registration, and its extent is not something to guess with a pattern. Then URLs lose query and
 * fragment, long hex becomes `0x…`, and long token-like strings become `<token>`.
 */
export const scrub = (t) => {
  let s = String(t);
  const at = s.search(new RegExp(ECHO, "i"));
  if (at >= 0) s = `${s.slice(0, at + ECHO.length)} ${ECHO_CUT}`;
  return s
    .replace(/https?:\/\/[^\s"')]+/g, (u) => redact(u))
    .replace(/0x[0-9a-fA-F]{20,}/g, "0x…")
    .replace(/[A-Za-z0-9_-]{40,}/g, "<token>");
};

/** Words that must not appear in a written evidence file. `"request"` is the echoed GraphQL request, not the driver's `"requests"` list. */
export const FORBIDDEN = ["rawId", "attestationObject", "clientDataJSON", "credentials", '"request"'];

/** Text and JSON files under `dir` (a directory, searched recursively, or one file) that contain a forbidden word: `[{ file, word }]`. */
export function checkEvidence(dir) {
  const hits = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(txt|json)$/.test(name)) {
        const text = readFileSync(p, "utf8");
        for (const word of FORBIDDEN) if (text.includes(word)) hits.push({ file: p, word });
      }
    }
  };
  if (statSync(dir).isDirectory()) walk(dir);
  else {
    const text = readFileSync(dir, "utf8");
    for (const word of FORBIDDEN) if (text.includes(word)) hits.push({ file: dir, word });
  }
  return hits;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  // bun scripts/e2e-sepolia/scrub.mjs <dir>...   exits 1 on a hit
  const hits = process.argv.slice(2).flatMap(checkEvidence);
  for (const h of hits) console.error(`FORBIDDEN ${h.word} in ${h.file}`);
  console.log(hits.length ? `${hits.length} hit(s)` : "evidence clean");
  process.exit(hits.length ? 1 : 0);
}
