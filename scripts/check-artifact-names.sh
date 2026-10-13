#!/usr/bin/env bash
# Fails if a script loads a compiled-artifact name the build does not produce (T-0251).
#
# Usage: scripts/check-artifact-names.sh [<root>]      (root: a copy of the repository, default this one)
#
# Method: static, against the sources, no build, no node, no network. scarb names an artifact
# `paved_<module>.<form>` for each `#[starknet::contract] mod <module>` of the package `paved`
# (contracts/Scarb.toml, `casm = true`: forms `contract_class.json` and `compiled_contract_class.json`).
# "Built" means reachable: the script walks the `mod` tree from contracts/src/lib.cairo (`mod x;` reads x.cairo
# next to its parent, an inline `mod x { }` is descended into) and skips every `#[cfg(test)]` module, so a
# contract file left on disk but no longer declared in the tree makes no artifact and does not count. The
# mocks are in the tree, so the devnet Token and MockRouter count. A build-file check would need
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
# only they load (MockRouter, Account, Daily, Lobby, Tutorial, Economy: the `((REPOINT))` and `((D18))`
# arrays and the functions repoint_* and d18_*) are listed. A name that exists at 06c024d and not on main is
# accepted only if it is in PINNED_06C024D below AND the load is in those pinned places; the same name in the
# fresh path (declare_class in the main sequence, the unflagged FUNDING_CLASSES) or anywhere else fails.
# A declare_class or --contract-name argument must be a Name, or $var / ${var} resolved as above; any other
# shape (`$(...)`, `${x:-y}`) fails instead of being skipped.
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

# The artifact names main builds: the `#[starknet::contract] mod <Name>` reachable from lib.cairo.
built = set()
MOD = re.compile(r"((?:#\[[^\]]*\]\s*)*)(?:pub\s+)?mod\s+(\w+)\s*([;{])")

def block_end(text, start):
    """The index after the `}` that closes the `{` at text[start]."""
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return i + 1
    sys.exit("check-artifact-names.sh: unbalanced braces in contracts/src")

def scan(text, directory, origin):
    text = re.sub(r"//[^\n]*", "", text)
    position = 0
    while True:
        m = MOD.search(text, position)
        if not m:
            return
        attributes, name, kind = m.groups()
        end = block_end(text, m.end() - 1) if kind == "{" else m.end()
        position = end
        if "cfg(test)" in attributes:
            continue
        if "starknet::contract" in attributes:
            built.add(name)
            continue
        if kind == "{":
            scan(text[m.end():end - 1], os.path.join(directory, name), origin)
        else:
            child = os.path.join(directory, name + ".cairo")
            if not os.path.isfile(os.path.join(root, child)):
                sys.exit(f"check-artifact-names.sh: {origin}: `mod {name};` has no file {child}")
            scan(read(child), os.path.join(directory, name), child)

scan(read("contracts/src/lib.cairo"), "contracts/src", "contracts/src/lib.cairo")
if not built:
    sys.exit("check-artifact-names.sh: no #[starknet::contract] module reachable from contracts/src/lib.cairo")

# (name, where, pinned) triples: pinned is true where the load runs from the pinned commit.
found = []
errors = []

def add(name, where, pinned=False):
    found.append((name, where, pinned))

deploy = read("scripts/deploy.sh")
lines = deploy.splitlines()

# Arrays: `NAME=(A B C)`, also behind `((FLAG)) &&`. FUNDING_CLASSES has a main value and one per pinned path.
arrays = {}  # array -> [(name, flagged)]: flagged when behind ((REPOINT)) / ((D18)), the pinned paths
for number, line in enumerate(lines, 1):
    m = re.match(r"\s*(\(\(\w+\)\)\s*&&\s*)?([A-Z_]+)=\(([^)]*)\)", line)
    if m and all(re.fullmatch(r"[A-Z]\w*", w) for w in m.group(3).split()):
        arrays.setdefault(m.group(2), []).extend((w, bool(m.group(1))) for w in m.group(3).split())

# The functions of the pinned modes: repoint_* and d18_* (from `name() {` to the `}` at column 0).
pinned_lines = set()
for number, line in enumerate(lines):
    if re.match(r"(?:repoint|d18)_\w+\(\)\s*\{", line):
        end = next((j for j in range(number, len(lines)) if lines[j] == "}"), number)
        pinned_lines.update(range(number, end + 1))

# Loops: header line, indent, end (the `done` at the same indent).
loops = []
for number, line in enumerate(lines):
    m = re.match(r"(\s*)for\s+(\w+)\s+in\s+(.*?);\s*do\s*$", line)
    if not m:
        continue
    end = next((j for j in range(number + 1, len(lines)) if lines[j] == m.group(1) + "done"), len(lines))
    loops.append((number, end, m.group(2), m.group(3)))

def resolve(var, number):
    """[(name, flagged)] a variable holds at a line: the words of the innermost loop around it, or its array."""
    around = [l for l in loops if l[0] < number < l[1] and l[2] == var]
    if not around:
        return None
    words = around[-1][3]
    m = re.fullmatch(r'"\$\{(\w+)\[@\]\}"', words)
    if m:
        return arrays.get(m.group(1))
    return [(w, False) for w in words.split()] if all(re.fullmatch(r"[A-Z]\w*", w) for w in words.split()) else None

# declare_class() takes its name as $1: its own paved_$name lines are covered by its call sites below.
body = next((n for n, l in enumerate(lines) if l.startswith("declare_class()")), None)
body_end = next((j for j in range(body, len(lines)) if lines[j] == "}"), body) if body is not None else None

ARG = re.compile(r"(?:declare_class|--contract-name)\s+(\"?\$[^\s;|&)]*|[A-Z]\w*)")
for number, line in enumerate(lines):
    where = f"scripts/deploy.sh:{number + 1}"
    code = re.sub(r"\s#\s.*$", "", line) if re.match(r"\s*#", line) is None else ""
    in_pinned = number in pinned_lines
    for arg in ARG.findall(code):
        if not arg.startswith(('"$', "$")):
            add(arg, where, in_pinned)
            continue
        m = re.fullmatch(r'"?\$\{?(\w+)\}?"?', arg)
        if m is None:
            errors.append(f"{where}: the argument {arg} is not a Name, $var or ${{var}}: cannot be resolved")
            continue
        if body is not None and body <= number <= body_end:
            continue
        names = resolve(m.group(1), number)
        if names is None:
            errors.append(f"{where}: {arg} has no `for {m.group(1)} in ...` list or array around it to resolve it from")
        for name, flagged in names or []:
            add(name, where, in_pinned or flagged)
    for var in re.findall(r"paved_\$\{?(\w+)\}?\.", code):
        if body is not None and body <= number <= body_end:
            continue
        names = resolve(var, number)
        if names is None:
            errors.append(f"{where}: paved_${var} has no `for {var} in ...` list or array around it to resolve it from")
        for name, flagged in names or []:
            add(name, where, in_pinned or flagged)
    for name in re.findall(r"\bpaved_([A-Z]\w*)\.", code):
        add(name, where, in_pinned)

# Literals in the other scripts, the signer's code, tests and README.
literal = re.compile(r"\bpaved_([A-Z]\w*)\.(?:contract_class|compiled_contract_class|\*|json)")
paths = ["scripts/test-deploy-url.sh"]
for base, dirs, files in os.walk(os.path.join(root, "scripts/signer")):
    dirs[:] = [d for d in dirs if d not in ("node_modules", "fixtures")]
    paths += [os.path.join(os.path.relpath(base, root), f) for f in files if not f.endswith(("package-lock.json", ".json"))]
for path in paths:
    for number, line in enumerate(read(path).splitlines(), 1):
        for name in literal.findall(line):
            add(name, f"{path}:{number}")

bad = {}
for name, where, pinned_load in found:
    if name not in built and not (name in PINNED_06C024D and pinned_load):
        bad.setdefault(name, []).append(where)

names = sorted({n for n, _, _ in found})
pinned = sorted({n for n, _, p in found if p})
print(f"artifact names the scripts load ({len(names)}): {' '.join(names)}")
print(f"built, reachable from contracts/src/lib.cairo ({len(built)}): {' '.join(sorted(built))}")
print(f"loaded by --repoint and --d18 (from 06c024d, not main): {' '.join(pinned) or 'none'}")
gone = sorted(n for n in names if n not in built)
if gone and not bad:
    print(f"accepted in the pinned paths only, not on main (PINNED_06C024D): {' '.join(gone)}")
for name, wheres in sorted(bad.items()):
    for where in sorted(set(wheres)):
        errors.append(f"{where}: paved_{name} is not built: no `#[starknet::contract] mod {name}` reachable from contracts/src/lib.cairo")
if errors:
    for e in sorted(set(errors)):
        print(f"check-artifact-names.sh: {e}", file=sys.stderr)
    sys.exit(1)
print("check-artifact-names.sh: ok")
PY
