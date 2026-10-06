# Local node choice (P0)

Date: 2026-10-06. Machine: Linux x86_64, 8 cores. Localhost only, nothing on a public network.

Question: which local node accepts Cairo 2.20 classes (Scarb 2.20.1, Sierra 1.9.3) without Dojo,
for Paved's tests and MVP?

## Recommendation

**starknet-devnet 0.10.0.** It is the only candidate that accepted the Scarb 2.20.1 class and ran
the full declare, deploy, invoke, call and event flow. Both Katana builds tried refuse the class.

Reproduce: `scripts/node/run-sample.sh devnet` (see `scripts/node/README.md`).

What would reverse it:
- A Katana release whose compiler accepts Sierra 1.9.x (re-run `PORT=5050 scripts/node/run-sample.sh katana`
  with `KATANA_BIN` set; if declare succeeds, Katana is a candidate again, mainly for its 0.6 to 1.0 s start-up and
  its Cartridge/Dojo ecosystem fit).
- Madara shown to accept the class (not tried, see below), if a node closer to a real sequencer is wanted.
- devnet failing on a Paved contract's size or gas needs (not tested: only the sample was run).
- From P3 on (Scarb 2.20.1, Sierra 1.9.x) starknet-devnet 0.10.0 is the local node: Katana (1.7.1, 1.8.0-rc.9) cannot declare Paved's classes. Katana at 2.13.1 (Sierra 1.7.0) only worked up to P2 (last row).

## Sample

`scripts/node/sample/`: native contract `Sample` (no Dojo), `starknet = "2.20.0"`, built with
Scarb 2.20.1 (cairo 2.20.0, sierra 1.9.3). `set_value(felt252)` writes storage and emits `ValueSet`;
`get_value()` reads it. `sierra_program` header of the artifact: `0x1, 0x9, 0x3`.

## Results

Tool: sncast 0.64.0 unless stated. Account: the node's first predeployed dev account (type `oz`).

| Candidate | Version | Source | RPC spec | Start-up (to first RPC answer) | Declare Sierra 1.9.3 |
| --- | --- | --- | --- | --- | --- |
| starknet-devnet | 0.10.0 | already installed (`~/.asdf`) | 0.10.2 | 6890 ms (first run), 1813 and 1989 ms (two later runs) | **accepted** |
| Katana | 1.7.1 | already installed (`~/.asdf`) | 0.9.0 | 985 ms | **refused** |
| Katana | 1.8.0-rc.9 (pre-release) | official release tarball, sha256 checked against `checksums.txt`, user space | 0.10.0 | 624 ms | **refused** |
| Madara | not tried | no binary, see below | n/a | n/a | n/a |

### starknet-devnet 0.10.0: full flow (real output)

Command: `starknet-devnet --host 127.0.0.1 --port 5051 --seed 42`, then `scripts/node/run-sample.sh devnet`.

| Step | Output |
| --- | --- |
| declare | class hash `0x530b006fc5c58faf8816c69b553d68139c6780cf43956f7d4eda0703593d1d9`, tx `0x4f51d9c3dc1a9e145b3679b35b0096b7fc36e45a7fcfe5c5ac55f4a91c5afc4`, 0.669 s wall for the sncast command |
| deploy (salt 1) | address `0x02c55b09f2a6f5e45cc77d749ba29393a848186558d8a0f4f9e60e883f75d83c`, tx `0x042f1adf92555c6d19f21b3c378822767c9f29a533bd8061fb1c6d371db87851` |
| invoke `set_value(42)` | tx `0x032b784836fa57d120480bd085d7136b22b04a601b38fb7a5da0cc1a30b4ac7d` |
| call `get_value` | `Response: 0x2a` |
| receipt | `execution_status: SUCCEEDED`, `finality_status: ACCEPTED_ON_L2`, block 3 |
| event in receipt | `from_address` = the contract, `keys` = `[0x3bcfdff2200d93292dd3eacdedd5d180b03c32e026410b89b302a5b2a3141f3]`, `data` = `[0x2a]` |
| fee fields | `actual_fee` = `0x572b2ff81e000` FRI; `execution_resources`: `l1_gas` 0, `l1_data_gas` 256, `l2_gas` 1533200 |

The second and third runs (the script, fresh node each time) gave the same class hash, addresses and tx hashes.

### Katana: refusal (real output)

Katana 1.7.1 (sncast 0.64.0 and 0.61.0): `Error: Unsupported Starknet version: 0.13.1.1`
(sncast rejects the block header that Katana reports; the RPC spec of Katana 1.7.1 is 0.9.0,
sncast warns it expects 0.10.0).

Katana 1.7.1 (sncast 0.51.2, which gets past that check) and Katana 1.8.0-rc.9 (sncast 0.64.0),
declare fails client side with `JSON-RPC error: code=63, message="An unexpected error occurred",
data={"reason":"internal task execution failed: task panicked"}`. The node log gives the cause:

```
called `Result::unwrap()` on an `Err` value: SierraCompilation(UnsupportedSierraVersion
{ version_in_contract: VersionId { major: 1, minor: 9, patch: 3 },
  version_of_compiler: VersionId { major: 1, minor: 7, patch: 0 } })
```

Both builds have a compiler limited to Sierra 1.7.0. The same sample built with Scarb 2.13.1
(`starknet = "2.13.1"`, Sierra 1.7.0, throw-away copy outside the repository) on Katana 1.8.0-rc.9
passed the whole flow: class `0x14e2b706305e39ee4f7e38221be5a34842230b8b652db976a52aaab3c96855`,
`get_value` = `0x2a`, receipt `SUCCEEDED`, event data `0x2a`, `l2_gas` 914855, `l1_gas` 4095.
Fee fields of Katana and devnet are not comparable: different nodes, different gas pricing and different Sierra versions.

### Madara: not tried

No Madara binary on this machine (`~/.asdf`, `~/.local/bin`, `~/.cargo/bin`, `~/.dojo`, `~/.katana`
searched), no docker (`which docker` empty), and the GitHub releases listed (`v0.11.0-alpha.5` to
`alpha.9`) carry no binary assets. The only route left was a cargo build from source of a
sequencer-sized workspace with git dependencies. I did not attempt it; no permission refusal was
involved. For information only (read from `main/Cargo.toml` on GitHub, not measured here):
it pins `cairo-lang-starknet-classes = "=2.17.0"`. Whether that rejects Sierra 1.9.3 is untested.

## Limits of this measure

- One tiny contract, one transaction of each kind. Nothing about Paved's real contract size, gas or throughput.
- Start-up times are single wall-clock samples with a warm disk cache after the first; devnet's 6.9 s first
  start is one sample and may be disk cache cost, not measured further.
- The devnet RPC spec is 0.10.2 and sncast 0.64.0 matched it without warning.
- Dev account keys are the public deterministic ones of each node; the script reads them from the node and writes none.
