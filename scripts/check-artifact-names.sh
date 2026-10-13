#!/usr/bin/env bash
# Fails if a script loads a compiled-artifact name the build does not produce (T-0251).
#
# Usage: scripts/check-artifact-names.sh [<root>]      (root: a copy of the repository, default this one)
#
# Method: static, against the sources, no build, no node, no network. scarb names an artifact
# `paved_<module>.<form>` for each `#[starknet::contract] mod <module>` of the package `paved`
# (contracts/Scarb.toml, `casm = true`: forms `contract_class.json` and `compiled_contract_class.json`).
# Modules under contracts/src/tests/ are `#[cfg(test)]` (lib.cairo) and make no artifact; the mocks under
# contracts/src/mocks/ are built, so the devnet Token and MockRouter count. A build-file check would need
# `scarb build` (about 7 GB of address space, AGENTS.md) and so a CI job that has the artifacts; this one
# runs wherever python3 does.
#
# The names it reads:
#   * scripts/deploy.sh: `declare_class <Name>`, `--contract-name <Name>`, every `paved_<Name>.` literal,
#     and the `paved_$name` of its loops. A name built from a variable is resolved, not skipped: the
#     variable's source is each `for name in <A B C>; do` list and each `FUNDING_CLASSES=(<A B C>)` array
#     of the file, and the check fails if a `paved_$var` has no such source, so a new loop cannot slip by.
#   * scripts/test-deploy-url.sh and scripts/signer/** (code, tests, README; not node_modules, not the
#     fixtures): every `paved_<Name>.` literal.
#
# --repoint and --d18 run from the pinned commit 06c024d, not from main (deploy.sh header), so the names
# only they load (MockRouter, Account, Daily, Lobby, Tutorial, Economy: the lines of `((REPOINT))` and
# `((D18))` and their loops) are listed. One that exists at 06c024d and not on main is accepted only if
# it is in PINNED_06C024D below.
set -euo pipefail

root="$(cd "${1:-$(dirname "${BASH_SOURCE[0]}")/..}" && pwd)"

python3 -I - "$root" <<'PY'
import os
import re
import sys

root = sys.argv[1]

# Names that exist at 06c024d and may be gone from main: step D (t-0250) deletes Lobby and Tutorial, and
# `deploy.sh --d18` still declares them from the pinned commit. Nothing else belongs here.
PINNED_06C024D = {"Lobby", "Tutorial"}

def read(path):
    with open(os.path.join(root, path), encoding="utf-8") as f:
        return f.read()

# The artifact names main builds: `mod <Name>` right after `#[starknet::contract]`, outside src/tests.
built = set()
for base, dirs, files in os.walk(os.path.join(root, "contracts/src")):
    rel = os.path.relpath(base, root)
    if rel == "contracts/src/tests" or rel.startswith("contracts/src/tests/"):
        continue
    for name in files:
        if not name.endswith(".cairo"):
            continue
        text = read(os.path.join(rel, name))
        built.update(re.findall(r"#\[starknet::contract\]\s*(?:#\[[^\]]*\]\s*)*(?:pub\s+)?mod\s+(\w+)", text))
if not built:
    sys.exit("check-artifact-names.sh: no #[starknet::contract] module found under contracts/src")

# (name, where) pairs.
found = []
errors = []

def add(name, where):
    found.append((name, where))

deploy = read("scripts/deploy.sh")
lines = deploy.splitlines()

# Arrays: `NAME=(A B C)`, also behind `((FLAG)) &&`. FUNDING_CLASSES has a main value and one per pinned path.
arrays = {}
pinned = set()  # names the --repoint and --d18 paths load, from the pinned commit
for number, line in enumerate(lines, 1):
    m = re.match(r"\s*(\(\(\w+\)\)\s*&&\s*)?([A-Z_]+)=\(([^)]*)\)", line)
    if m and all(re.fullmatch(r"[A-Z]\w*", w) for w in m.group(3).split()):
        arrays.setdefault(m.group(2), []).extend(m.group(3).split())
        if m.group(1):
            pinned.update(m.group(3).split())

# Loops: header line, indent, end (the `done` at the same indent).
loops = []
for number, line in enumerate(lines):
    m = re.match(r"(\s*)for\s+(\w+)\s+in\s+(.*?);\s*do\s*$", line)
    if not m:
        continue
    end = next((j for j in range(number + 1, len(lines)) if lines[j] == m.group(1) + "done"), len(lines))
    loops.append((number, end, m.group(2), m.group(3)))

def resolve(var, number):
    """The names a variable holds at a line: the words of the innermost loop around it, or its array."""
    around = [l for l in loops if l[0] < number < l[1] and l[2] == var]
    if not around:
        return None
    words = around[-1][3]
    m = re.fullmatch(r'"\$\{(\w+)\[@\]\}"', words)
    if m:
        return arrays.get(m.group(1))
    return words.split() if all(re.fullmatch(r"[A-Z]\w*", w) for w in words.split()) else None

# declare_class() takes its name as $1: its own paved_$name lines are covered by its call sites below.
body = next((n for n, l in enumerate(lines) if l.startswith("declare_class()")), None)
body_end = next((j for j in range(body, len(lines)) if lines[j] == "}"), body) if body is not None else None

for number, line in enumerate(lines):
    where = f"scripts/deploy.sh:{number + 1}"
    code = re.sub(r"\s#\s.*$", "", line) if re.match(r"\s*#", line) is None else ""
    for arg in re.findall(r"(?:declare_class|--contract-name)\s+(\"?\$?\w+\"?)", code):
        var = arg.strip('"')
        if var.startswith("$") and body is not None and body <= number <= body_end:
            continue
        if var.startswith("$"):
            names = resolve(var[1:], number)
            if names is None:
                errors.append(f"{where}: {arg} has no `for {var[1:]} in ...` list or array around it to resolve it from")
            for name in names or []:
                add(name, where)
        elif re.fullmatch(r"[A-Z]\w*", var):
            add(var, where)
    for var in re.findall(r"paved_\$\{?(\w+)\}?\.", code):
        if body is not None and body <= number <= body_end:
            continue
        names = resolve(var, number)
        if names is None:
            errors.append(f"{where}: paved_${var} has no `for {var} in ...` list or array around it to resolve it from")
        for name in names or []:
            add(name, where)
    for name in re.findall(r"\bpaved_([A-Z]\w*)\.", code):
        add(name, where)

# Literals in the other scripts, the signer's code, tests and README.
literal = re.compile(r"\bpaved_([A-Z]\w*)\.(?:contract_class|compiled_contract_class|\*|json)")
paths = ["scripts/test-deploy-url.sh"]
for base, dirs, files in os.walk(os.path.join(root, "scripts/signer")):
    dirs[:] = [d for d in dirs if d not in ("node_modules", "fixtures")]
    paths += [os.path.join(os.path.relpath(base, root), f) for f in files if not f.endswith(("package-lock.json", ".json"))]
paths.append("scripts/deploy.sh")
for path in paths:
    for number, line in enumerate(read(path).splitlines(), 1):
        for name in literal.findall(line):
            add(name, f"{path}:{number}")

bad = {}
for name, where in found:
    if name not in built and name not in PINNED_06C024D:
        bad.setdefault(name, []).append(where)

names = sorted({n for n, _ in found})
print(f"artifact names the scripts load ({len(names)}): {' '.join(names)}")
print(f"built by contracts/src ({len(built)}): {' '.join(sorted(built))}")
print(f"loaded by --repoint and --d18 (from 06c024d, not main): {' '.join(sorted(pinned)) or 'none'}")
gone = sorted(n for n in names if n not in built)
if gone and not bad:
    print(f"accepted, not on main (PINNED_06C024D): {' '.join(gone)}")
for name, wheres in sorted(bad.items()):
    for where in sorted(set(wheres)):
        errors.append(f"{where}: paved_{name} is not built: no `#[starknet::contract] mod {name}` in contracts/src")
if errors:
    for e in sorted(set(errors)):
        print(f"check-artifact-names.sh: {e}", file=sys.stderr)
    sys.exit(1)
print("check-artifact-names.sh: ok")
PY
