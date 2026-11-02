# Paved's own accounts: identities, OpenZeppelin accounts and login keys (#918, design)

The client's connection leaves Cartridge's controller, which is no longer maintained. The owner's decisions of 2026-10-30
bind:

- Cartridge's controller leaves the client.
- Paved accounts on the L3: one per player, created for a new player.
- Several login methods, social ones included, inspired by Eternum (BibliothecaDAO/eternum).
- Development first: a key pair in `localStorage`.
- Randomness on the L3 comes from a Katana TEE, its secret in a secret environment variable, in place of Cartridge's VRF
  provider. Its implementation is its own issue; this note does not cover it.
- **The account class is OpenZeppelin's classic account**: one public key per account, rotatable with `set_public_key`. No
  custom account class. This rules out Eternum's several device keys and a guardian on the account itself.

The issue's open points keep their defaults until the owner answers them (section 9). Section 7, phase A, is as built.

**The messages' encryption** (owner, 2026-11-01, #998) adds a second key per player, the **messaging key** (X25519), apart
from the account's key, which keeps only signing. Its design is `messaging-encryption.md`; this note records what it
changes for the keys, the devices and the threats (sections 4 to 9).

Sources: #918 and its reading of Eternum's `next` branch on 2026-10-30 (`apps/realms`, an identity service on better-auth
1.5.3; `packages/core/src/account/realms-account.ts`, a random Stark key per browser). The account's interface is
OpenZeppelin's `openzeppelin_account::interface::AccountABI` (`get_public_key`, `set_public_key`, `__validate_deploy__`),
read from the class that starknet-devnet 0.10.0 predeploys (`0x05b4b537…3564`).

## 1. Summary

- **An identity per player, one account per identity, one key per account.** The account is OpenZeppelin's: it holds one
  public key, and only `set_public_key` changes it.
- **A guest** makes a random key on its device at first launch; its account's address comes from that key. The key never
  leaves the device.
- **A login key per identity**, held by the key service in the Katana TEE, with its secret in the TEE's secret environment
  (as the VRF's). It is never computable from public data.
- **A guest who adds a login keeps its account**: the account calls `set_public_key` to the login's key. The address, and
  so the progress, do not change. The service records the identity's account address.
- **Another device** gets the login key from the service over TLS, right after a login, and signs for the same account.
- **A lost device** is handled by rotating the account's key (`set_public_key`, by the service): every other device logs in
  again for the new key. There is no per-device revocation with one key.
- **The trade-off**: the key service holds every login key (in the TEE). That is what a one-key account needs to serve
  several devices. A per-device model would need a custom account class (open point 1).
- **Phase A (now)**: no identity and no service yet. Every player is what a guest will be: a device's key in
  `localStorage` and the OpenZeppelin account of that key, deployed on its first write. The pages see the same
  `WalletConnector` as before.

## 2. Identity

One per player, from a login (Discord, Google, Apple, an emailed code; a password later if wanted: open point 5). The
identity service (better-auth, as Eternum's) gives it its id. The service records, per identity, its account's address:
after a guest's rotation (section 5) that address cannot be computed from the login key, since it came from the guest's.

## 3. The account: OpenZeppelin's

- **The class**: OpenZeppelin's classic account, one Stark public key, constructor `(public_key)`. No custom class. Phase A
  uses the class starknet-devnet 0.10.0 predeploys (`LOCAL_ACCOUNT_CLASS_HASH`, OpenZeppelin's `AccountMixinImpl` with
  SRC-9 and `upgrade`); phase B declares the chosen OpenZeppelin class on the L3 and the devnet and puts its hash in the
  deployments.
- **Its address is counterfactual**: computed from the class, the public key of its first key (as the salt and the
  constructor argument) and the zero deployer. The client knows it before anything is deployed.
- **Deployed on the player's first write**: by itself (a DEPLOY_ACCOUNT, fee-free on the L3), or by a deployer that pays.
- **Its key changes only by `set_public_key(new_public_key, signature)`**: called by the account itself, so signed by its
  current key, with the new key's signature over the change, which OpenZeppelin requires. A rotation keeps the address,
  the account's state and every contract's record of the player.

## 4. Keys

| Key | Made by | Kept where | Leaves its place |
|---|---|---|---|
| A guest's key | the device, from `crypto.getRandomValues` | that device: `localStorage` in phase A, then IndexedDB (open point 7) | never |
| An identity's login key | the key service, in the Katana TEE: derived there from the identity's id and the TEE's secret, or generated once and sealed (open point 2) | the TEE; and each device the player has logged in on | only to a device that has just logged in, over TLS, never logged |
| The messaging key (X25519, versioned; #998) | the player's device, from `crypto.getRandomValues`, at the first connect | the device's key ring (IndexedDB), every version kept; after a login, the ring sealed in the key service's TEE (#998, open point 3) | its private part as the login key does: only to a device that has just logged in, over TLS, never logged. Its public part is published, bound by the account's key |

The account's key signs the messaging key's binding, each envelope and each guild epoch; it never encrypts. The messaging
key never signs a transaction. Each binding is valid only against the account's key of its time, so every rotation below
re-signs it (`messaging-encryption.md`, section 3.3).

No key is derived from public data. A key derived from the login outside a TEE would be a brain wallet (from a password) or
would need a server secret anyway (from a provider's user id): the TEE is where that secret lives.

## 5. The guest, then a login (the owner's question)

1. At first launch the guest makes its key; its account's address comes from that key. The account is deployed on its first
   write.
2. The guest logs in. The service makes (or derives) the identity's login key.
3. The guest's account calls `set_public_key(login_public_key, signature)`: the transaction is signed by the guest's key,
   and `signature` is the login key's, given by the service for that one change. The account's key is now the login key.
4. The service records the identity's account address; the device replaces its guest key with the login key. The
   messaging key does not change: its binding is signed again by the login key, and the ring is sealed into the key
   service (#998).
5. The address does not change: the player keeps their progress.

**The login already has an account** (the player signed in elsewhere first). Default (open point 3): the login's account is
kept; the guest's progress stays on the guest's account, and the player is told before linking. No rotation is made.

**A login without a guest** (a new player who signs in first): the service makes the identity's login key, and the account's
address comes from it. It is deployed on its first write.

## 6. Devices

- **Another device**: the player logs in; the service hands the identity's login key to the device over TLS after the
  login; the device keeps it as a guest's key is kept, and signs for the account the service records. With it, the sealed
  key ring (#998), so the device reads the player's whole message history.
- **Losing a device, or "Sign out everywhere"** (phase D): the service rotates the account's key (`set_public_key`, signed
  with the current login key held in the TEE, with the new key's signature). The old key can no longer write. Every other
  device logs in again to get the new key. It also makes a new version of the messaging key (#998): the ring keeps the old
  versions for the history, the new binding is published, contacts see "security key changed", and the player's guild
  starts a new epoch, so the lost device stops reading what comes next.
- **No per-device revocation**: with one key per account, every device of the player holds the same key, so a rotation
  signs every device out at once.

## 7. Phases

### A. Now: the local key (as built)

- **Cartridge's controller is gone from the client.** `@cartridge/controller` left `packages/chain`'s dependencies, and
  `createControllerConnector` with it; no chunk of the client's build holds it. The session's record
  (`controllerPolicies`, `CONTROLLER_ENTRY_POINTS`, the P-65 guard) stays in `chain/src/auth/controller.ts`, unused by the
  client, with the tests that check it against the writers' calls.
- **The local-key connector** (`chain/src/auth/local-key.ts`, `createLocalKeyConnector`; the app's
  `src/wallet/connector.ts`) behind the unchanged `WalletConnector` of `src/wallet/wallet.tsx`. It is the guest of
  section 5, step 1:
  - **Connect** makes a key on the first connect (`newPrivateKey`) and keeps it under `paved:device-key`. Its OpenZeppelin
    account's address is computed (`localKey`): `LOCAL_ACCOUNT_CLASS_HASH`, the public key as the salt and the constructor
    argument, the zero deployer. So the address is the same whether the account deploys itself or a deployer deploys it.
  - **A reload keeps the account**: the key is found without a prompt (`probe`). **Disconnect** keeps the key and marks it
    signed out (`paved:device-key:signed-out`), so no reload reconnects it until Connect, which finds the same account.
  - **The first write deploys the account**, once per key, when the node finds no contract at its address
    (`getClassHashAt`), then sends the write. A failed deployment sends nothing (`AccountDeployError`, read by the writer as
    a refusal before sending) and is tried again at the next write.
    - On **devnet** the deployer account the deployments use (the node's first predeployed account; its key is the
      devnet's public one) deploys it through the UDC and gives it 10 STRK for its fees, in one multicall (`deployedBy`).
      The client takes the deployer from `VITE_DEPLOYER_ADDRESS` and `VITE_DEPLOYER_PRIVATE_KEY`, read only in a devnet
      build (static accesses behind a build-time test, as the burner was): in any other build they fold away.
    - **Elsewhere** the account deploys itself (a DEPLOY_ACCOUNT, `deployedBySelf`): fee-free on the L3, or from a funded
      address. The class must be declared on that network (phase B); the L3's test network is to be checked when it
      exists.
  - **Writes are signed by the key** (starknet.js's `Account`), with no session policies and no prompt. There is no
    username before the identities: the address names the player.
  - **Settings' Reset** (Account group): forgets the key and connects a new one, so a new account. For testing: the old
    account cannot be recovered.
- **The connectors' chunk**: the connector is loaded with `import()` on the first Connect or on a page that reads the
  account, never by the first load of `/`. Its module and starknet.js are lazy chunks.
- **Tests**: `chain/test/local-key.test.ts` (the key, the address, the first-write deployment, disconnect, reset, the
  devnet deployer's multicall), `chain/test/local-key-devnet.test.ts` (both deployments and the writes on a real
  starknet-devnet; `PAVED_DEVNET=1`, CI has none), `app/__tests__/wallet-connector.test.ts` (the app's connector per network),
  `app/__tests__/settings-route.test.tsx` (Reset).

### B. OpenZeppelin's account class

Declared on the L3 and the devnet, its class hash in the deployments (in place of `LOCAL_ACCOUNT_CLASS_HASH`), and the key
rotation (`set_public_key`) tested from the client.

### C. The identity and key service

The logins; the login keys in the TEE (sealed or derived, open point 2); the guest's rotation to a login; the identity's
account address; the hand-over of the login key to a new device; the rotation after a lost device. For the messages
(#998): sealing the player's key ring in the TEE and handing it over with the login key. Hosted with its secrets
(open point 4): beside the Katana TEE, with the VRF's secret handling; the logins' part (better-auth) may run as a small
serverless service, its secrets in the host's secret store.

### D. The connect flow

- The "Connect" sheet with the methods (social buttons, email).
- The guest's prompt to save the account by adding a login.
- The account page: the linked logins, and "Sign out everywhere" (a rotation of the account's key and a new version of the
  messaging key, #998).

The account's connector takes the local key's place behind `WalletConnector`, so the pages that write do not change.

## 8. Threats

| Threat | What bounds it |
|---|---|
| A guest's key is read from its device (malware, a shared browser, an extension with page access) | It signs for that account only. Adding a login rotates it away; in phase A, Reset makes a new key, and the account of a stolen key is a test account. Phase A keeps the key in `localStorage` (open point 7: IndexedDB later) |
| A login key is read from one of the player's devices | Every device holds the same key: "Sign out everywhere" rotates it (`set_public_key`), after which the old key cannot write; the other devices log in again |
| The key service is compromised (the TEE or its secret) | It holds every login key: this is the trade-off of a one-key account (section 1, open point 1). The keys live only in the TEE; the secret is in the TEE's secret environment, never in a bundle or the repository. A guest's key is not there |
| A login key is intercepted on its way to a device | It is sent only to a device that has just logged in, over TLS, and never logged; a rotation ends its use |
| A login account is taken over (the provider's account) | The attacker can get the login key, as the player can. The player rotates the key after recovering the login; the provider's own protections (2FA) apply |
| A key in a bundle or the repository | None is: a guest's key is made on the device, a login key in the TEE. The devnet deployer's key is the devnet's public one and is read only in a devnet build |
| A key derived from public data | None is: a guest's key is random, a login key is derived only with the TEE's secret (or generated and sealed) |
| A guest loses its device before adding a login | Its account cannot be recovered: there is no other copy of the key. The guest's prompt (phase D) asks to add a login |
| Phishing for the key | No flow asks for the key or shows it; nothing exports it in phase A |
| A messaging key ring is read from one of the player's devices (#998) | It reads that player's message history. "Sign out everywhere" rotates the account's key on chain and makes a new messaging key version and a new guild epoch; every other client checks the chain before sealing and seals neither to the old key nor into the old epoch, even if the social service withholds the new ones (`messaging-encryption.md`, sections 5 and 6.3), so it reads nothing sent after that. No forward secrecy (#998, open point 5) |
| A retired key (a stolen device after "Sign out everywhere", a guest's key after a login) signs a backdated message (#998) | Its signature is not taken as the player's unless the reader saw it live before the rotation, or, for moderators, the social service accepted it before the rotation (`messaging-encryption.md`, section 3.4) |
| The key service is compromised, for the messages (#998) | Passively, it holds the sealed rings with the login keys, so it could read the private and guild messages: the same trust as the account; #998's open point 3 alternative (a recovery code or a device link) removes that part. Actively, it holds the login key, which signs the messaging key's binding, so it can bind a key of its own and receive what follows, whichever choice of open point 3: pinned contacts see "security key changed", a new contact cannot tell, and comparing the safety code catches it (`messaging-encryption.md`, section 4.5). It comes from the one-key account (open point 1) |
| The social service serves a messaging key of its own (#998) | Each client checks the key's binding against the account's key on chain (`messaging-encryption.md`, section 3.3) |

## 9. Open points (defaults until the owner answers on #918)

1. One key per account, or one per device: one key per account, the login keys held by the key service in the TEE, as
   decided with the OpenZeppelin account. The alternative (device keys approved by a guardian, as Eternum) needs a custom
   class.
2. The login key, sealed or derived: derived in the TEE from the identity's id and the TEE's secret.
3. A guest whose login already has an account: the login's account is kept; the player is told before linking.
4. Where the service runs: beside the Katana TEE; the logins' part may run as a small serverless service.
5. The first logins: Discord, Google, Apple and an emailed code; a password later if wanted.
6. External wallets (Braavos, Argent, Ready): later, linked to an identity by a signature, as Eternum's.
7. Key storage on the device: `localStorage` in phase A, then IndexedDB; "Sign out everywhere" rotates the key. The
   messaging key ring is in IndexedDB from the start, as raw keys: a non-exportable WebCrypto key could not be sealed for
   the player's other devices (`messaging-encryption.md`, section 4.6).
