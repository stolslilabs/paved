// bun test scripts/e2e-sepolia/scrub.test.mjs: synthetic data only, nothing here is a real credential.
import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ECHO_CUT, FAILURE, checkEvidence, isFailureText, operationName, redact, scrub } from "./scrub.mjs";

// A made-up echo shaped like the keychain's: the error line, then a multi-line request with fake credential fields.
const ECHO_TEXT = [
  "Connect Controller",
  "d16-fake-name",
  'rpc error: code = Internal desc = internal server error: {"response":{"errors":[{"message":"rpc error: code = Internal desc = internal server error","path":["fakeOperation"]}],"data":null,"status":200,"headers":{}},"request":{"query":"',
  " mutation FakeOperation($credentials: String!) {",
  "  fakeOperation(credentials: $credentials) { username }",
  '}","variables":{"network":"SN_FAKE","credentials":"{\\"id\\":\\"FAKE-ID-FAKE-ID\\",\\"rawId\\":\\"FAKE-RAW\\",\\"response\\":{\\"attestationObject\\":\\"FAKE-ATTEST\\",\\"clientDataJSON\\":\\"FAKE-CLIENT\\"}}"}}}',
  "By continuing you are agreeing",
  "Authentication failed. Please try again.",
].join("\n");

test("scrub cuts everything after `internal server error`", () => {
  const out = scrub(ECHO_TEXT);
  for (const word of ["rawId", "attestationObject", "clientDataJSON", "credentials", "FAKE-", '"request"', "mutation", "Authentication failed"]) {
    expect(out).not.toContain(word);
  }
  expect(out).toContain("Connect Controller");
  expect(out).toContain("internal server error");
  expect(out.endsWith(ECHO_CUT)).toBe(true);
});

test("scrub cuts an echo whose error is not `internal server error`, e.g. code = Unavailable", () => {
  const raw = [
    "Connect Controller",
    'rpc error: code = Unavailable desc = upstream connect error: {"response":{"errors":[{"message":"x","path":["fakeOperation"]}],"data":null},"request":{"query":"mutation FakeOperation($credentials: String!) { a }","variables":{"credentials":"{\\"rawId\\":\\"FAKE-RAW\\"}"}}}',
    "By continuing you are agreeing",
  ].join("\n");
  const out = scrub(raw);
  for (const word of ["rawId", "credentials", "FAKE-", '"request"', "mutation", "By continuing"]) expect(out).not.toContain(word);
  expect(out).toContain("code = Unavailable");
  expect(out.endsWith(ECHO_CUT)).toBe(true);
  expect(FAILURE.test(raw)).toBe(false); // the driver's pattern would miss it; the cut must not depend on it
});

test("scrub cuts a multi-line echo that has no marker, at the end of the rpc error line", () => {
  const out = scrub("Connect Controller\nrpc error: code = Unavailable desc = down\n mutation Fake($credentials: String!) {\n  FAKE-SECRET\n}\nBy continuing");
  for (const word of ["credentials", "FAKE-SECRET", "mutation", "By continuing"]) expect(out).not.toContain(word);
  expect(out).toContain("code = Unavailable desc = down");
});

test("scrub keeps a benign rpc error line whole, on its own", () => {
  expect(scrub("Error: rpc error: code = Unauthenticated desc = access denied")).toBe("Error: rpc error: code = Unauthenticated desc = access denied");
});

test("scrub cuts a one-line echo too, and leaves other text alone", () => {
  expect(scrub('x internal server error: {"request":{"a":1}} tail')).toBe(`x internal server error ${ECHO_CUT}`);
  expect(scrub("Welcome! Let's create a new Controller")).toBe("Welcome! Let's create a new Controller");
});

test("scrub shortens long hex and token-like strings, and URLs lose query and fragment", () => {
  expect(scrub(`0x${"ab".repeat(32)}`)).toBe("0x…");
  expect(scrub("A".repeat(50))).toBe("<token>");
  expect(scrub("see https://x.example/connect?id=abc#frag now")).toBe("see https://x.example/connect now");
  expect(redact("https://x.example/a?b=1#c")).toBe("https://x.example/a");
});

test("operationName is read from the raw text, name only", () => {
  expect(operationName(ECHO_TEXT)).toBe("fakeOperation");
  expect(operationName("mutation OtherOp($a: String!) { x }")).toBe("OtherOp");
  expect(operationName("nothing here")).toBeNull();
});

test("checkEvidence flags forbidden words and passes clean files", () => {
  const dir = mkdtempSync(join(tmpdir(), "scrub-test-"));
  try {
    writeFileSync(join(dir, "clean.txt"), "Create Controller\nSMS\nPASSKEY");
    writeFileSync(join(dir, "clean.json"), JSON.stringify({ requests: [], frames: [] }));
    expect(checkEvidence(dir)).toEqual([]);
    writeFileSync(join(dir, "bad.json"), '{"request":{"x":1}}');
    writeFileSync(join(dir, "bad.txt"), "has rawId in it");
    expect(checkEvidence(dir).map((h) => h.word).sort()).toEqual(['"request"', "rawId"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("scrub cuts an echo whose quotes are escaped", () => {
  const raw = 'rpc error: code = Unavailable desc = x: {\\"response\\":{\\"data\\":null},\\"request\\":{\\"variables\\":{\\"rawId\\":\\"FAKE\\"}}} tail';
  const out = scrub(raw);
  for (const w of ["rawId", "FAKE", "tail", "variables", "data"]) expect(out).not.toContain(w);
});

test("isFailureText does not depend on the error wording", () => {
  expect(isFailureText("rpc error: code = Unavailable desc = down")).toBe(true);
  expect(isFailureText('x {"response":{}}')).toBe(true);
  expect(isFailureText('x \\"request\\": 1')).toBe(true);
  expect(isFailureText("Authentication failed. Please try again.")).toBe(true);
  expect(isFailureText("Create Controller\nSMS\nPASSKEY")).toBe(false);
});

test("checkEvidence flags an escaped request marker too", () => {
  const dir = mkdtempSync(join(tmpdir(), "scrub-test-"));
  try {
    writeFileSync(join(dir, "esc.json"), JSON.stringify({ text: 'x {"request":{"a":1}}' }));
    expect(checkEvidence(dir).length).toBeGreaterThan(0);
    writeFileSync(join(dir, "esc.json"), 'x \\"request\\": 1');
    expect(checkEvidence(dir).length).toBeGreaterThan(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
