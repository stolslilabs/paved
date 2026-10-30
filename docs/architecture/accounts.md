# Paved's own accounts: identities, accounts and device keys (#918, design)

The client's connection leaves Cartridge's controller, which is no longer maintained. The owner's decisions of 2026-10-30
bind:

- Cartridge's controller leaves the client.
- Paved accounts on the L3: one per player, created for a new player.
- Several login methods, social ones included, inspired by Eternum (BibliothecaDAO/eternum).
- Development first: a key pair in `localStorage`.
- Randomness on the L3 comes from a Katana TEE, its secret in a secret environment variable, in place of Cartridge's VRF
  provider. Its implementation is its own issue; this note does not cover it.

The issue's open points keep their defaults until the owner answers them (section 8). Section 6, phase A, is as built.

Sources: #918 and its reading of Eternum's `next` branch on 2026-10-30 (`apps/realms`, an identity service on better-auth
1.5.3; `packages/core/src/account/realms-account.ts`, a random Stark key per browser; the account's address from the
identity's id, the class and a guardian's key; a new device joins with the guardian's approval).

## 1. Summary

- **Three things, kept apart**: an **identity** (who the player is: a login, or an anonymous guest), an **account** (one per
  identity, on chain), and **device keys** (one random key per device, held by that device only).
- **No key is derived from the login.** A device makes a random key; the account holds several device keys; a guardian
  approves each new one after a login. Nothing secret is computed from an OAuth id or a password.
- **A guest is an anonymous identity**, with its own account and device key from the first launch. Adding a login links the
  login to that same identity: the identity's id does not change, so neither does the account nor the key. Nothing moves
  on chain.
- **Phase A (now)**: no identity and no guardian yet. A device's key in `localStorage` and the account of that key, deployed
  on its first write. The pages see the same `WalletConnector` as before.

## 2. Identity

One per player, from a login (Discord, Google, Apple, an emailed code; a password later if wanted) or **anonymous for a
guest**. The identity service gives it its id. Better-auth, as Eternum's, has an anonymous plugin that links a guest's
session to a later login, which is the guest's path of section 5.

The identity's id is not secret: it is the salt of the account's address (section 3). Knowing it gives nothing to sign
with.

## 3. Account

- **One per identity.** Its address is counterfactual: computed from the identity's id (as the salt), the account class,
  and the guardian's public key (a constructor argument). The client knows it before anything is deployed.
- **Deployed on the player's first write**: fee-free on the L3, or by a deployer that pays.
- **Its class (phase B)**: several device keys and a guardian. A device key signs the player's writes; the guardian's
  signature is needed to add a device key, never to play. A limit of devices (Eternum: 8). A revoked key cannot rejoin.
  Default: a small Paved class modelled on Eternum's `realms-account`, reviewed and tested, its gas measured; an audited
  class with a guardian if one fits several device keys (open point 3).

## 4. Device keys

- **One random Stark key per device**, made by the device from the platform's cryptographic random
  (`crypto.getRandomValues`), and kept there: `localStorage` in phase A, then IndexedDB (open point 7). It never leaves
  the device. Only its public key goes on chain.
- **Another device**: the player logs in on it; the new device makes its key; the service checks the login and the
  guardian signs the key's addition; from then the device writes for the same account.
- **Revocation**: from the account page (phase D), signed by a device of the account or by the guardian after a login. A
  revoked key can no longer write. Because a key is revocable, a stolen one is bounded in time.

Why not a key derived from the login (open point 1): a key derived from a provider's user id needs a server secret, so the
service would hold, in effect, every player's key (custodial); a key derived from a password is a brain wallet that a weak
password exposes. And a derived key is what makes a guest's link to a later login hard: the guest's key would have to be
replaced by the login's.

## 5. The guest, then a login

- At first launch the guest gets an anonymous identity and a device key, so an account, deployed on its first write.
- Adding a login **links the login to that same identity**: same id, same account, same key. Nothing moves on chain.
- **The login already has an account** (the player signed in elsewhere first). Default (open point 4): the login's account
  wins; the guest's progress stays on the guest's account, and the player is told before linking.

## 6. Phases

### A. Now: the local key (as built)

- **Cartridge's controller is gone from the client.** `@cartridge/controller` left `packages/chain`'s dependencies, and
  `createControllerConnector` with it; no chunk of the client's build holds it. The session's record
  (`controllerPolicies`, `CONTROLLER_ENTRY_POINTS`, the P-65 guard) stays in `chain/src/auth/controller.ts`, unused by the
  client, with the tests that check it against the writers' calls: the account of phase B may take a session again.
- **The local-key connector** (`chain/src/auth/local-key.ts`, `createLocalKeyConnector`; the app's
  `src/wallet/connector.ts`) behind the unchanged `WalletConnector` of `src/wallet/wallet.tsx`:
  - **Connect** makes a key on the first connect (`newPrivateKey`) and keeps it under `paved:device-key`. Its account's
    address is computed (`localKey`): the OpenZeppelin account class that starknet-devnet 0.10.0 predeploys
    (`LOCAL_ACCOUNT_CLASS_HASH`, constructor `(public_key)`), the public key as the salt and the constructor argument, the
    zero deployer. So the address is the same whether the account deploys itself or a deployer deploys it.
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
      address. The class must be declared on that network; the L3's test network is to be checked when it exists.
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

### B. The account contract

Several device keys and a guardian, a limit of devices and revocation (section 3), with its tests and its gas measured.

### C. The identity and guardian service

The logins, the anonymous guest and its link to a login, the guardian's approvals, the devices' limit and revocation.
Default (open point 5): a small serverless service, as Eternum's worker, its secrets in the host's secret store, owned by
the project. The guardian's key is a server secret, never in a bundle.

### D. The connect flow

- The "Connect" sheet with the methods (social buttons, email).
- The guest's prompt to save the account by adding a login.
- The account page: the linked logins and the devices, with revoke.

The account's connector takes the local key's place behind `WalletConnector`, so the pages that write do not change.

## 7. Threats

| Threat | What bounds it |
|---|---|
| A device key is read from the device (malware, a shared browser, an extension with page access) | The key signs for that account only. From phase B it is revocable from another device or after a login; in phase A Reset makes a new key, and the account of a stolen key is a test account. Phase A keeps the key in `localStorage` (open point 7: IndexedDB with a non-extractable key later) |
| A key in a bundle or the repository | None is: a device key is made on the device. The devnet deployer's key is the devnet's public one and is read only in a devnet build; the guardian's key (phase C) is a server secret |
| A key derived from public data | None is derived: device keys are random (section 4) |
| The service's guardian key is stolen (phase C) | It can add a key to an account, not sign its writes; its approvals are logged and the devices are listed on the account page, where a device can revoke the added key. The key lives in the host's secret store |
| A login account is taken over (phase C) | The attacker can approve a new device for that account, as a player can; the account page shows the devices and revokes them. The login's own protections (the provider's 2FA) apply |
| A guest loses its device before adding a login | Its account cannot be recovered: there is no other key and no login. The guest's prompt (phase D) asks to add a login |
| The identity's id leaks | It is the account's salt, public by design: it gives nothing to sign with |
| Phishing for the key | No flow asks for the key or shows it; nothing exports it in phase A |

## 8. Open points (defaults until the owner answers on #918)

1. Derived keys or device keys: device keys approved by a guardian.
2. The first logins: Discord, Google, Apple and an emailed code; a password later if wanted.
3. The account class: a small Paved class, reviewed and tested, modelled on Eternum's.
4. A guest whose login already has an account: the login's account is kept; the player is told before linking.
5. Where the service runs: a small serverless service, its secrets in the host's secret store.
6. External wallets (Braavos, Argent, Ready): later, linked to an account by a signature.
7. Key storage on the device: `localStorage` in phase A, then IndexedDB.
