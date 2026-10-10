// The signer's subcommands, through starknet.js. Each returns the plain object printed as JSON.

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { Account, RpcProvider, config, json, stark } from 'starknet';

import { parseCalls } from './args.mjs';
import { assertChain } from './env.mjs';

// starknet.js logs warnings (an RPC version mismatch, a fee retry) with the node's details: silence it.
config.set('logLevel', 'OFF');

/**
 * Checks the node's chain before anything is signed, then builds the provider with that chain id
 * fixed, so starknet.js never takes it from the node unchecked (the account signs with the
 * provider's chain id).
 * @param {{ address: string, privateKey: string, rpcUrl: string, network: string, chainId: string }} env
 */
export async function connect({ address, privateKey, rpcUrl, network, chainId }) {
  const probe = new RpcProvider({ nodeUrl: rpcUrl });
  assertChain(await probe.channel.fetchEndpoint('starknet_chainId'), network);
  const provider = new RpcProvider({ nodeUrl: rpcUrl, chainId });
  const account = new Account({ provider, address, signer: privateKey });
  return { provider, account };
}

// One line per call on stderr, before it is signed: what the account is about to touch.
function announce(...words) {
  process.stderr.write(`signer: ${words.join(' ')}\n`);
}

async function confirm(provider, transactionHash) {
  const receipt = await provider.waitForTransaction(transactionHash);
  const status = receipt.execution_status ?? receipt.value?.execution_status;
  if (status !== 'SUCCEEDED') {
    const reason = receipt.revert_reason ?? receipt.value?.revert_reason ?? '';
    throw new Error(`transaction ${transactionHash} did not succeed (${status ?? 'unknown status'}) ${reason}`.trim());
  }
}

async function readJson(path) {
  return json.parse(await readFile(path, 'utf8'));
}

export async function declare({ account }, { sierra, casm }) {
  const contract = await readJson(sierra);
  const compiled = await readJson(casm);
  announce('declare', basename(sierra));
  const { class_hash, transaction_hash } = await account.declareIfNot({ contract, casm: compiled });
  if (transaction_hash) await confirm(account.provider, transaction_hash);
  return { class_hash, transaction_hash: transaction_hash || null, already_declared: !transaction_hash };
}

export async function deploy({ account }, { classHash, salt, calldata }) {
  const chosenSalt = salt ?? stark.randomAddress();
  announce('deploy class', classHash, 'through the universal deployer');
  // deployContract waits for the receipt and reads the address from the deployer's event.
  const result = await account.deployContract({
    classHash,
    salt: chosenSalt,
    unique: true,
    constructorCalldata: calldata,
  });
  return {
    contract_address: result.contract_address,
    transaction_hash: result.transaction_hash,
    class_hash: classHash,
    salt: chosenSalt,
  };
}

async function execute(account, calls) {
  for (const { contractAddress, entrypoint } of calls) announce('invoke', contractAddress, entrypoint);
  const { transaction_hash } = await account.execute(calls);
  await confirm(account.provider, transaction_hash);
  return { transaction_hash };
}

export async function invoke({ account }, { contract, entrypoint, calldata }) {
  return execute(account, [{ contractAddress: contract, entrypoint, calldata }]);
}

export async function multicall({ account }, { calls }) {
  return execute(account, parseCalls(await readJson(calls)));
}

export async function call({ provider }, { contract, entrypoint, calldata }) {
  const result = await provider.callContract({ contractAddress: contract, entrypoint, calldata });
  return { result };
}
