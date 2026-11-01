# End-to-end encrypted messages: the keys, the accounts and devices, the directory, the social service and moderation (#998, design)

Design note for #998. **Documents only**: no client, service or contract code. The client builds the encryption first, on
the mock (#997); the services follow the client's validation. This note fixes the plan they will follow.

The owner's decisions bind:

- **End-to-end encryption of the private and guild messages, with asymmetric keys** (2026-11-01). This answers
  `social.md`'s open point 5 (#956), whose default was no end-to-end encryption.
- **The contracts and the services wait for the client's validation; their strategy is documented first** (2026-10-31,
  #956).
- **Paved's own accounts**: OpenZeppelin's account, one key per account, with a key service in the Katana TEE (2026-10-30,
  #918).

The issue's open points keep their defaults until the owner answers on #998 (section 11).

Sources: #998, #997, #956, #918; `social.md`, `accounts.md`; `packages/game-core/src/social/chat.ts` (the conversations'
IDs, the 200-character limit, `filterWords`).

What was read to check each choice (2026-11-01):

| Source | Version read | What it settles here |
|---|---|---|
| RFC 7748 (X25519) | RFC, January 2016 | The function, the all-zero check (6.1), the test vectors (5.2, 6.1) |
| RFC 5869 (HKDF) | RFC, May 2010 | Salt and info (3.1, 3.2), the SHA-256 test cases (Appendix A.1 to A.3) |
| RFC 9180 (HPKE) | RFC, February 2022 | The key wraps (section 2.3), the suite's IDs, the test vectors (Appendix A.2) |
| draft-irtf-cfrg-xchacha | -03, 2020-01-10, expired, never an RFC | XChaCha20-Poly1305, its 192-bit nonce, the test vectors (A.1, A.3.1) |
| SNIP-12 | revision 1, status Review | The signed types (section 3.2) |
| `@noble/curves`, `@noble/hashes`, `@noble/ciphers` | 2.4.0 each, from the lockfile | The interfaces, the audits, the low-order check (section 2.4) |
| `starknet` (starknet.js) | 8.9.2, from the lockfile | SNIP-12 revision 1 as the client signs it (`u256`, `string`, `shortstring`) |
| `openzeppelin_account` | 4.0.1 (Scarb registry) | `is_valid_signature`, `get_public_key`, the `OwnerAdded` and `OwnerRemoved` events |
| MDN browser-compat-data, `api/SubtleCrypto.json` | `main` on 2026-11-01 | WebCrypto's X25519 per browser (section 4.6) |

## 1. Summary

- **Encrypted**: the private conversations and the guilds' conversations. A message is sealed on its sender's device and
  opened on its readers' devices; the social service stores and relays envelopes it cannot read.
- **Not encrypted**: the World, the guild's description and announcements, and the metadata (who writes to whom, when, in
  which guild). A message's length is hidden by padding.
- **A messaging key per player**: X25519, with a version, apart from the account's Stark key. The account's key signs it
  into a **binding** that each client checks against the chain, so the service cannot slip in a key of its own.
- **A private conversation** is sealed under a key both players derive (X25519, then HKDF-SHA-256), with
  XChaCha20-Poly1305 and a random nonce.
- **A guild** is sealed under an **epoch key**, wrapped for each member (HPKE, RFC 9180), and replaced at each joining,
  kick, leave and member's key change. The members are the chain's, so the service cannot add a reader.
- **Moderation by message franking**: a report reveals the reported message and the 5 before it, each proved by a
  commitment the sender signed. Nothing else is read; private and guild messages are no longer scanned.
- **The other devices** get the player's key ring from the key service's TEE after a login, as they get the login key
  (#918). The encryption holds against the social service, its database, its backups and its moderators, the network and
  the chain; it relies on the key service's TEE as the account itself does.
- **No forward secrecy now** (open point 5): the keys are fixed until a "Sign out everywhere".
- **Checked and changed from the issue's plan**: the wraps take HPKE's standard form (section 2.3); the public keys and
  hashes are `u256` in SNIP-12 (section 3.2); a binding is valid only against the account's key of its time, which makes a
  stale key detectable (section 3.3); an epoch commits to its key (section 6.4); a member's key change starts an epoch
  (section 6.2); an epoch of 50 wraps costs about 110 to 200 ms on the VPS, not a few tens of milliseconds (section 6.6).

## 2. The keys and the algorithms

### 2.1 The keys

| Key | What it is | Made | Kept | Used for |
|---|---|---|---|---|
| The account's key | Stark (#918) | the device (a guest), the key service (a login) | as `accounts.md` says | signing: the messaging key's binding, each envelope, each guild epoch. Never encrypting |
| The messaging key | X25519 (32-byte private and public parts), with a version (1, 2, ...) | the player's device | its private part in the **key ring** on the device (IndexedDB), and sealed in the key service for the player's other devices (open point 3); its public part in the directory | deriving the conversations' keys, opening the guild's epoch keys |
| A conversation's key | 32 bytes, from HKDF-SHA-256 | each side, from its own private key and the other's public key | in memory | sealing a private conversation's messages |
| A guild's epoch key | 32 random bytes | the member's device that starts the epoch | wrapped for each member, in the service | sealing the guild's messages for one epoch |
| A franking key | 32 random bytes, one per message | the sender | inside the sealed message | the report's proof (section 8) |

The key ring holds every version of the player's messaging key (the old ones open the history), and the epoch keys the
device has unwrapped, so a page opens without unwrapping again.

### 2.2 The algorithms

- **X25519** (RFC 7748) for every key agreement.
- **HKDF-SHA-256** (RFC 5869) for every derived key. Its `info` binds the key to its use (RFC 5869, 3.2), so a key is never
  used by two protocols, as `@noble/ciphers`' README also asks ("Don't re-use keys between different protocols").
- **XChaCha20-Poly1305** (draft-irtf-cfrg-xchacha-03) for the messages, with a random 24-byte nonce. The nonce is 192 bits,
  so random nonces are safe: `@noble/ciphers` gives `2**72` messages under one key, where a 12-byte random nonce gives
  `2**23` for the same margin. A conversation's key and an epoch's key seal many messages from two or more devices that do
  not share a counter, so a random nonce is the fit. The draft expired in 2020 and is not an RFC: the construction
  (HChaCha20, then ChaCha20-Poly1305 of RFC 8439) is stable and is libsodium's, and its test vectors (A.1, A.3.1) are what
  game-core's tests replay.
- **HMAC-SHA-256** for the franking commitments (section 8).
- **SHA-256** for the hashes the account's key signs (section 3.2) and the safety code (#997).

### 2.3 The key wraps: HPKE, not a hand-built box (checked)

The issue's plan wraps a key with a hand-built sealed box (an ephemeral X25519 key, HKDF, XChaCha20-Poly1305) and asks
whether HPKE (RFC 9180) is its standard form. It is: HPKE's base mode with DHKEM(X25519) is that box, specified, with test
vectors. **The note takes HPKE.**

- **The suite**: KEM `0x0020` DHKEM(X25519, HKDF-SHA256), KDF `0x0001` HKDF-SHA256, AEAD `0x0003` ChaCha20Poly1305
  (RFC 9180, tables 2, 3 and 5). `enc` is 32 bytes, the AEAD's key 32, its nonce 12, its tag 16.
- **What HPKE adds to the hand-built box**: the KEM's context is the ephemeral public key **and the recipient's** public key
  (`kem_context = concat(enc, pkRm)`, section 4.1), and every step is labelled with the suite (`suite_id`), so a wrap made
  for one key or one suite never opens as another. A hand-built box that hashed only the shared secret would lack the
  first.
- **The 12-byte nonce is safe here**: each wrap's key comes from a fresh ephemeral key and seals one message, so HPKE's
  nonce (derived, sequence 0) never repeats. XChaCha is not one of HPKE's AEADs and is not needed for a single-use key.
- **Single-shot**: `SealBase(pkR, info, aad, pt)` returns `enc, ct` (section 6.1); `OpenBase` reverses it. `info` is
  `'paved/epoch/v1'`; `aad` is the epoch's header (the guild, the epoch's number, the member, the member's key version), so
  a wrap cannot be moved to another epoch or member.
- **Built from the same `@noble` primitives**, about 60 lines in game-core's `social/e2e.ts`, and checked against RFC 9180's
  vectors for this suite (Appendix A.2, "DHKEM(X25519, HKDF-SHA256), HKDF-SHA256, ChaCha20Poly1305", A.2.1 the base mode).
  No HPKE package is in the lockfile, and `@noble/curves` 2.4.0 ships none.
- **Forward secrecy of a wrap** (RFC 9180, 9.7.4): forward secret against the sender's compromise (the ephemeral key is
  erased), not against the recipient's. That matches the fixed keys of open point 5.
- **Alternative** (if #997 prefers one AEAD everywhere): the hand-built box with XChaCha20-Poly1305, with HKDF's info
  holding both public keys as HPKE's context does. It has no published vectors of its own.

### 2.4 The libraries (checked)

- **Taken**: `@noble/curves` 2.4.0, `@noble/hashes` 2.4.0, `@noble/ciphers` 2.4.0. All three are already in the lockfile
  (`@noble/ciphers` 2.4.0 at the top level; `@noble/curves` and `@noble/hashes` 2.4.0 through `ox` 1.8.5), so a client PR
  adds them to game-core's dependencies, pinned exactly, with no new package. One major version for the three: they are
  released together, ESM only, and share their utilities.
- **Not taken**: `@noble/curves` 1.7.0 and `@noble/hashes` 1.6.x, which starknet.js 8.9.2 and `@scure/starknet` 1.1.0 use
  for the Stark curve. They are older majors with other import paths (`@noble/curves/ed25519`, without `.js`). The
  messaging code does not share them; the bundle carries both, in the chat's lazy chunk (#997's bundle rule).
- **The interfaces read**:
  - `x25519.keygen()` returns `{ secretKey, publicKey }`; `x25519.getSharedSecret(secretKey, publicKey)` returns 32 bytes
    (`@noble/curves/ed25519.js`). It conforms to RFC 7748 and does not hash the result: HKDF is ours.
  - `hkdf(sha256, ikm, salt, info, length)` (`@noble/hashes/hkdf.js`), `hmac(sha256, key, msg)`
    (`@noble/hashes/hmac.js`), `sha256` (`@noble/hashes/sha2.js`). Version 2 takes `Uint8Array` only: a string `info`
    throws (seen while measuring), so labels are encoded with `TextEncoder` once.
  - `xchacha20poly1305(key, nonce, aad).encrypt(data)` and `.decrypt(ciphertext)`; the ciphertext ends with the 16-byte tag
    and `decrypt` throws on any change (`@noble/ciphers/chacha.js`); `chacha20poly1305` for HPKE; `randomBytes` from
    `@noble/ciphers/utils.js` (the platform's CSPRNG).
- **The low-order points**: RFC 7748 (6.1) lets an implementation check for an all-zero shared secret. `@noble/curves`
  2.4.0 rejects the low-order public keys **before** the ladder (`abstract/montgomery.js`, `scalarMult`: "invalid private
  or public key received"), so a crafted key from the directory throws instead of giving a known secret. game-core treats
  that throw as the message's or the wrap's refusal.
- **The audits** (each README's "Security"): `@noble/curves` by Trail of Bits at 2.3.0 (August 2026), Cure53 at 1.6.0
  (2024), Kudelski and Trail of Bits earlier; `@noble/ciphers` by Cure53 at 1.0.0 (2024, everything in scope);
  `@noble/hashes` by Cure53 (2022; `sha2`, `hmac` and `hkdf` in scope). The versions taken are past their audits; each
  README links its changes since.
- **Bundled, never fetched**: they are npm packages in the build. The same code runs
  in the client and the service (game-core).

## 3. The directory: who has which public key

### 3.1 The binding

- A **SNIP-12 message** under the domain `'Paved Messaging Key'`, version `'1'`, the L3's chain id, revision 1, holding the
  account's address, the public key, its version and the time. The account's key signs it.
- **Published** to the social service when the key is made, and again when the account's key changes (a login added, a
  "Sign out everywhere"). The service serves it with the player's profile.
- **Pinned**: each client keeps, for each contact, the last version it used and its public key. A new version shows
  "<name>'s security key changed" in the conversation (#997), with the safety code.

### 3.2 The SNIP-12 types (checked)

SNIP-12 revision 1 (status Review) has `u128`, `ContractAddress`, `timestamp`, `shortstring` (31 ASCII characters at
most), `string` (arbitrary length) and the preset `u256` (`low`, `high`, both `u128`). starknet.js 8.9.2 encodes them all;
its `string` is the Poseidon hash of the Cairo `ByteArray`'s serialisation.

- **A public key is a `u256`, never a `felt`**: an X25519 key is 256 bits, a felt 252. The same for every SHA-256 hash.
- **The domains**: `'Paved Messaging Key'` (19 characters) for the binding; `'Paved Social'`, version `'1'`, as the
  service's sign-in (`social.md`, 5.3), for the envelopes and the epochs. Revision is the integer `1`, as SNIP-12 asks.
- **The types**:

| Type | Fields |
|---|---|
| `MessagingKey` | `account: ContractAddress`, `key: u256`, `version: u128`, `at: timestamp` |
| `Message` (#956's, 5.4, changed) | `conversation: string`, `sender: ContractAddress`, `epoch: u128` (0 for a private conversation), `sender_version: u128`, `reader_version: u128` (0 for a guild), `at: timestamp`, `counter: u128`, `sealed: u256` (SHA-256 of the nonce and the ciphertext), `commitment: u256` |
| `Epoch` | `guild: u128`, `number: u128`, `block: u128`, `members: u256` (SHA-256 of the sorted addresses), `wraps: u256` (SHA-256 of the wraps in the members' order), `key_commitment: u256` (section 6.4), `creator: ContractAddress`, `at: timestamp` |

The conversation is a `string` because its ID (`dm:<a>:<b>`, two addresses) passes 31 characters. `Message` carries the
sealed text's hash and the commitment in place of the text's hash: the account signs what the service can check.

### 3.3 Checked by each client against the chain

- **A deployed account**: the client checks the binding's signature with the account's `is_valid_signature` (OpenZeppelin's
  account 4.0.1 returns `VALIDATED`), or locally against `get_public_key`. **An account not deployed yet**: against the
  public key whose counterfactual address it is (`social.md`, 5.3; `accounts.md`, section 3).
- **The binding is valid only against the account's key of its time.** A rotation (`set_public_key`) changes the account's
  key, so every binding signed before it stops verifying against the current key. That is what is wanted: after "Sign out
  everywhere" the messaging key changes too (section 4.4), and a service that kept serving the old binding is caught, since
  it no longer verifies. After adding a login, the messaging key does not change and the binding is signed again by the new
  key (section 4.2).
- **Old signatures** (an envelope or an epoch signed before the sender's rotation) are checked against the key the account
  had then. OpenZeppelin's account emits `OwnerAdded { new_owner_guid }` (the new public key) at its initialisation and at
  each `set_public_key`, and `OwnerRemoved { removed_owner_guid }` before it. **The indexer serves each account's key
  history** from those events (new, phase 3), and a client checks a signature against the key valid at the envelope's
  block-time. The service already follows those events to end the sessions (`social.md`, 5.3).
- So the service cannot slip in a key of its own: it would need the account's key to sign the binding.

### 3.4 On chain instead (open point 2)

A registry contract, one small write per key version, with an event the indexer serves. Its history would be public and
ordered, so the service could not serve an older key in place of the latest even for an account whose key did not rotate.
With section 3.3, the off-chain directory already catches a stale key after a rotation; what the registry adds is the case
where the messaging key changes without the account's (none in this plan).

## 4. The accounts and the devices (#918)

### 4.1 A guest

Makes its messaging key at its first connect, beside its device key, and publishes its binding. The ring stays on the
device. A guest who loses the device loses their history, as they lose their account (`accounts.md`, section 8).

### 4.2 Adding a login (`accounts.md`, section 5)

- The account's key rotates to the login key; the messaging key does not change.
- The binding is signed again by the new account key and published.
- The ring is sealed into the key service.

### 4.3 Another device

After the login, the key service hands over the login key (#918) and the sealed ring, over TLS. The device reads the whole
history.

### 4.4 "Sign out everywhere" (`accounts.md`, phase D)

- It rotates the account's key, and makes a new version of the messaging key, bound by the new account key.
- The ring keeps the old versions, to read the history.
- The directory serves the new version; contacts see "security key changed".
- The player's guild starts a new epoch (section 6.2), so the stolen device stops reading the guild as well.

### 4.5 The ring in the key service (open point 3)

Sealed in the TEE, and released only to a device logged in to that identity, as the login key is. So the encryption holds
against the social service, its database, its backups and its moderators, and against the network and the chain. It relies
on the key service's TEE, as the account itself does (`accounts.md`, section 8). A login that already has an account
(`accounts.md`, open point 3): the guest's ring stays with the guest's account.

### 4.6 WebCrypto's X25519 for the ring (checked: not taken)

- **Support**: X25519 in WebCrypto from Chrome 133, Firefox 130 and Safari 17 (MDN's compat data, the same for
  `generateKey`, `deriveBits`, `deriveKey`, `importKey`, `exportKey`).
- **A key that cannot be exported cannot be sealed for other devices**: Node v24.21.0, with a non-extractable X25519 key,
  refuses both `exportKey('pkcs8')` and `wrapKey` (`InvalidAccessError`), as the specification says. The ring must reach
  the key service (open point 3), so its private keys stay raw bytes, used with `@noble/curves`. A non-extractable key
  would fit only open point 3's alternative, and not even there: its recovery code and its device link also export the
  ring.
- **Kept for later, as a speed-up only**: the ephemeral keys of the wraps are never exported, so WebCrypto could make them
  (section 6.6). It needs a fallback for older browsers.

## 5. Private conversations

- **The conversation's key**: `HKDF-SHA-256(ikm = X25519(my private key, their public key), salt = the conversation's ID,
  info = 'paved/dm/v1' || the two public keys || the two versions)`. The keys and versions are taken in the conversation
  ID's order (the two addresses as `privateConversation` sorts them), so both sides derive the same key. The public keys in
  `info` bind the key to the pair, as HPKE's context does.
- **The sealed message**: a 2-byte length, the text in UTF-8, the franking key, then zeros, to **1,024 bytes**, under
  XChaCha20-Poly1305 with a random 24-byte nonce. The longest text, 200 code points (`chatLength`) of 4 bytes, is 800
  bytes, so 834 bytes fit. The ciphertext is 1,040 bytes with its tag.
- **The associated data** is the envelope's header: the conversation, the sender, both versions, the time and the sender's
  counter. So a message cannot be moved to another conversation, given another sender or replayed under another counter.
- **The envelope** holds the header, the nonce, the ciphertext and the commitment (section 8), and the sender's account
  signature over `Message` (section 3.2).
- **A stranger's request** is sealed in the same way: the recipient's key is in the directory from their first connect. A
  player with no key yet cannot be written to (refusal `no-key`).
- **Both players read what either sent**: the key is the pair's, not the sender's.

## 6. Guild conversations

### 6.1 Epochs

An epoch key is wrapped (section 2.3) for each member's current messaging key version. Each epoch is one record: the
guild, the epoch's number, the block of the membership it covers, its creator, the members, the wraps and the key's
commitment. Its creator's account key signs it (`Epoch`, section 3.2).

### 6.2 Who starts one

Any member may.

- At a joining, the joiner's client starts one. The joiner reads from there on (#997, open point 2).
- At a kick, the officer's client starts one.
- At a leave, the first remaining member's client that sees the departure starts one, and the service asks it to.
- **At a member's new key version** ("Sign out everywhere"), that member's client starts one (added: without it, a stolen
  device's ring would read the current epoch until the next change).
- The service accepts epoch N+1 once: the first valid one. A client whose epoch lost the race reads the winner, and starts
  N+2 only if the winner does not cover the change it saw.

### 6.3 The members are the chain's

- A client wraps only for the chain's members at a block (`Guild`, through the indexer), and names that block.
- A client refuses an epoch whose members or creator do not match the chain at its block, or whose block is before a
  departure the client knows of.
- So the service cannot add a reader.

### 6.4 The key's commitment (added)

A member can check its own wrap only. A creator who wrapped different keys for different members would split the guild: each
part reading its own messages, every message unreadable for the others. So the epoch carries
`key_commitment = HMAC-SHA-256(epoch key, 'paved/epoch/commit' || guild || number)`, signed with the record, and each member
checks that its unwrapped key matches it. A mismatch refuses the epoch, and the client asks for the next.

### 6.5 Messages

Sealed with the epoch's key, as the private ones (padding, nonce, franking). The associated data is the guild, the epoch,
the sender, the time and the counter. They are signed as the private ones are. **The signature is what tells members
apart**: every member holds the epoch key, so the AEAD alone cannot say which member sealed a message.

### 6.6 The cost (measured)

- **An epoch of 50 wraps** (#953's cap), each an ephemeral key and an X25519 with HKDF and ChaCha20-Poly1305, with
  `@noble` 2.4.0 on Node v24.21.0: **110 to 204 ms** on the VPS (8 cores, load average 3 to 5, three runs). One X25519 is
  1.4 to 2.5 ms. The issue's "a few tens of milliseconds on a phone" does not hold: a low-end phone is likely several times
  slower than the VPS, so up to about a second (an estimate, not a measure). It happens once per joining, kick, leave or key
  change, off the conversation's opening: the client starts the epoch in a worker or in slices, and the mock's PR measures
  it on the slowest device at hand (#997).
- **With WebCrypto's X25519** for the ephemeral keys, the same 50 key agreements took 41 ms on Node (section 4.6): a
  speed-up to take if a phone's figure demands it.
- **Opening a page of 50 messages** (XChaCha20-Poly1305 of 1,040 bytes and the HMAC each, under one key): 1.9 to 4.3 ms on
  the VPS, plus one X25519 for a private conversation's key, cached for the session. Within #997's 20 ms for the page.

### 6.7 Not taken now: MLS (RFC 9420)

It brings forward secrecy and recovery after a compromise in groups, at the cost of a large dependency and a state per
member (open point 5).

## 7. The social service: what changes from #956

- **It stores** envelopes and epochs, never a private or guild text, never a private key. The World stays as `social.md`
  says.
- **It checks**: the session; the sender's signature over `Message` or `Epoch`; the membership and the rank, from the
  chain; the rate limits (game-core); the envelope's size (exactly 24 bytes of nonce and 1,040 of ciphertext); the time
  within 5 minutes of its clock; the counter above the sender's last in that conversation.

  It cannot check the 200-character limit or the text's rules: the clients do, with game-core's rules, and a reader shows a
  text over the limit as unreadable.
- **The word filter** moves to the readers' clients (game-core's `filterWords`), with the list served by the service.
  Every reader gets the same text, since the list is the same. The World's filter stays in the service.
- **New endpoints**: the directory (publish and read bindings), and the guilds' epochs (publish, read, and the request to
  start one). The sealed ring is the key service's (#918), not the social service's.
- **Unchanged**: the retention, deletion on request, the socket and the hosting (`social.md`, 5.2).

## 8. Moderation: message franking

- **The commitment**: each sealed message holds a random franking key. Its envelope holds
  `HMAC-SHA-256(franking key, 'paved/frank/v1' || text || conversation || sender || time)`, each field preceded by its
  length so no two inputs read alike. The sender signs the envelope, and so the commitment.
- **Why a commitment, and not the AEAD**: Poly1305 is not key-committing. A ciphertext can be made to open under two keys
  to two texts ("invisible salamanders", which `@noble/ciphers`' README warns of), so the ciphertext alone proves nothing
  to a moderator. HMAC-SHA-256 under a key the sender picks binds one text: a second text with the same commitment would be
  an HMAC collision.
- **On opening**, the reader's client checks the commitment. A mismatch shows the message as unreadable, so a sender cannot
  show a text other than the one it committed to.
- **A report** sends the reported message's text and franking key, and those of the 5 messages before it (#997, open point
  3).
  - The moderator recomputes each commitment and checks the sender's signature (against the key of its time, section 3.3).
    That proves who wrote what, and nothing that was not reported is read.
  - A reporter cannot invent a text: it would need a franking key that gives the signed commitment.
  - The report dialog says what is shared. The service keeps the revealed texts with the report, under `social.md`'s
    retention.
- **What moderation loses**: no scanning of the private and guild messages. The World is moderated as before.
- **What players lose**: deniability. A signed envelope and a revealed text prove to anyone who wrote it. That is the
  price of moderation by proof, as it was with #956's signed plain texts.

## 9. Threats

| Threat | What bounds it |
|---|---|
| The social service, its database or a backup leaks | Envelopes and metadata; no text |
| The service serves a key of its own | The binding's signature fails (section 3.3) |
| The service serves a contact's old key after a "Sign out everywhere" | The old binding no longer verifies against the account's current key (section 3.3) |
| The service adds a reader to a guild | The epoch's signature and the chain's members refuse it (section 6.3) |
| A member wraps different keys for different members | The epoch's key commitment (section 6.4) |
| A member writes as another member | The sender's account signature (section 6.5) |
| The service replays or moves a message | The associated data and the counter |
| The service holds back messages | Not prevented; the counters show the gaps |
| A crafted low-order public key in the directory | `@noble/curves` refuses it before the ladder (section 2.4) |
| The key service's TEE is compromised | It can release the rings, so the messages can be read: the same trust as the account (open point 3's alternative removes it) |
| A device is stolen | Its ring reads the history. "Sign out everywhere" stops it from reading what comes next, private (new version) and guild (new epoch) |
| A reader leaks a conversation | Not preventable; a leak with the franking keys is provable, as a report is |
| A key taken later reads the past | No forward secrecy with fixed keys (open point 5) |
| Who talks to whom, and when | Visible to the service; lengths hidden by the padding |

## 10. The phases

1. **The mock** (#997): game-core's `social/e2e.ts` (with the RFC 7748, RFC 5869, XChaCha draft and RFC 9180 vectors) and
   the client, on the mock.
2. **This note**, merged.
3. **The social service** gains the directory and the epochs, with a shared fixture of envelopes: game-core's cases,
   replayed by the service's tests. **The indexer** gains the accounts' key history (`OwnerAdded`, `OwnerRemoved`, section
   3.3). To check then: that the L3's `starknet_getEvents` filters by key without a contract address, since the accounts
   are not known in advance.
4. **The key service** seals and hands over the rings (`accounts.md`, phase C).
5. **The chat's real source** behind the same `ChatSource` as the mock (`social.md`, section 9, step 5): the pages do not
   change.

## 11. Open points (defaults until the owner answers on #998)

1. **The World.** Default: not encrypted (#997, open point 1).
2. **The directory.** Default: in the social service, each key signed by its account. Alternative: a registry contract on
   chain, public and tamper-evident, at one small write per key version (section 3.4).
3. **The player's other devices.** Default: the ring sealed in the key service's TEE, handed over after a login, as the
   login key is. Alternative: the ring never leaves the player's devices in clear. A recovery code of 12 words encrypts a
   backup that the service keeps, or a link from a device the player already has passes it on. A lost code loses the
   history.
4. **What a report reveals.** Default: the reported message and the 5 before it (#997, open point 3).
5. **Forward secrecy.** Default: none now (fixed keys). Alternative: a ratchet now: the Double Ratchet for private
   conversations, MLS for the guilds. It is much more work, and harder across several devices.
6. **The guild's description and announcements.** Default: not encrypted, since the description shows on the guild's public
   profile. Alternative: the announcements sealed with the epoch key, for members only.

**The issue's "To check" list, answered**:

- HPKE against the hand-built box: HPKE's base mode is taken for the wraps (section 2.3).
- The `@noble` versions and interfaces: 2.4.0 for the three, already in the lockfile (section 2.4).
- WebCrypto's non-exportable X25519 for the ring: not suitable, since the ring is sealed for other devices (section 4.6).
- The SNIP-12 types: revision 1, with `u256` for the keys and hashes (section 3.2).
- The timings on a low-end phone: measured on the VPS, estimated for a phone; the phone's figure is the mock's PR's
  (section 6.6).
