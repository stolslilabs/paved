// A game's NFT: (Collection address, token id). The Collection (E5b, `contracts/src/systems/collection.cairo`) mints one
// soulbound token per game at spawn: a Daily game's token id is its game id, a Tutorial game's is 2^32 + its game id.
// `token_uri` returns `data:application/json;base64,` + the JSON of the game; the client reads it as data and never
// as markup.

import collectionAbi from "../../../contracts/abis/Collection.json";
import { AbiCodec, type Abi } from "./codec";
import type { Deployment } from "./deployment";
import { toViewError, ViewError, type CallProvider, type GameMode } from "./views";

/** `TUTORIAL_OFFSET` of the Collection: Tutorial token ids start here (2^32), Daily ids are the game ids below it. */
export const TUTORIAL_TOKEN_OFFSET = 0x100000000n;

/** `TOKEN_LIMIT` of the Collection: the first token id no game owns (2^33). */
export const TOKEN_LIMIT = 0x200000000n;

/** `Collection.json`, the committed ABI. */
export const COLLECTION_ABI = collectionAbi as Abi;

/**
 * The token id of a game, in BigInt (a Tutorial id passes 2^32 and the ids are u256 on chain). A game id is a u32 on
 * chain; anything else is refused rather than rounded.
 */
export function nftOf(mode: GameMode, gameId: number | bigint): bigint {
  if (typeof gameId === "number" && !Number.isSafeInteger(gameId)) throw new RangeError(`${gameId} is not a game id`);
  const id = BigInt(gameId);
  if (id < 0n || id >= TUTORIAL_TOKEN_OFFSET) throw new RangeError(`${id.toString()} is not a game id`);
  return mode === "tutorial" ? TUTORIAL_TOKEN_OFFSET + id : id;
}

/** The token id an indexer row carries (`GameRow.token_id`): a safe integer, read as BigInt. */
export function tokenIdOf(value: number): bigint {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${value} is not a token id`);
  return BigInt(value);
}

/** `0x1234…cdef` for a long address, the address as is when short. */
export function shortAddress(address: string): string {
  return address.length > 14 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

/** What the screens print for a game's NFT: "NFT: 0x1234…cdef #4294967297". */
export function nftLabel(collection: string, tokenId: bigint): string {
  return `NFT: ${shortAddress(collection)} #${tokenId.toString()}`;
}

/** The Collection's address of a deployment, or null when it is unknown (a deployment before E5b). */
export function collectionAddress(deployment: Pick<Deployment, "collection">, indexed?: string | null): string | null {
  for (const candidate of [indexed, deployment.collection]) {
    if (!candidate) continue;
    try {
      if (BigInt(candidate) !== 0n) return candidate;
    } catch {
      // Not an address: try the next source.
    }
  }
  return null;
}

/** One attribute of the token's JSON. Values are printed as text: a string, number or boolean only. */
export interface NftAttribute {
  traitType: string;
  value: string;
}

/** The JSON of `token_uri`, reduced to what the screens print. `json` is the text as the contract gave it. */
export interface NftMetadata {
  name: string | null;
  description: string | null;
  attributes: NftAttribute[];
  /** The JSON text, to show as is. */
  json: string;
}

/** `token_uri` answers `unreadable` for anything that is not a data URI of JSON, or whose JSON is not an object. */
export class NftMetadataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NftMetadataError";
  }
}

/** Largest `token_uri` the client reads, in characters. The contract's JSON is under 300. */
export const MAX_TOKEN_URI_LENGTH = 16_384;

const DATA_URI = /^data:application\/json(;[a-z0-9-]+=[a-z0-9._-]+)*(;base64)?,/i;

function decodeBase64(text: string): string {
  const clean = text.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) throw new NftMetadataError("token_uri is not base64");
  const binary = atob(clean);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function textOf(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return null;
}

/**
 * Reads a `token_uri`. Only a `data:application/json` URI is decoded (base64 or percent-encoded); an http or ipfs URI
 * is not fetched. The result holds strings only: the JSON's own markup-looking text stays text, and it is the screen's
 * job to print it as text (React escapes it), never as HTML.
 */
export function parseTokenUri(uri: string): NftMetadata {
  if (uri.length > MAX_TOKEN_URI_LENGTH) throw new NftMetadataError("token_uri is too long");
  const head = DATA_URI.exec(uri);
  if (!head) throw new NftMetadataError("token_uri is not a data:application/json URI");
  const body = uri.slice(head[0].length);
  let json: string;
  try {
    json = head[2] ? decodeBase64(body) : decodeURIComponent(body);
  } catch (error) {
    throw error instanceof NftMetadataError ? error : new NftMetadataError("token_uri cannot be decoded");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new NftMetadataError("token_uri JSON is not valid");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new NftMetadataError("token_uri JSON is not an object");
  const o = parsed as Record<string, unknown>;
  const attributes: NftAttribute[] = [];
  if (Array.isArray(o.attributes)) {
    for (const item of o.attributes) {
      if (typeof item !== "object" || item === null) continue;
      const a = item as Record<string, unknown>;
      const traitType = textOf(a.trait_type);
      const value = textOf(a.value);
      if (traitType !== null && value !== null) attributes.push({ traitType, value });
    }
  }
  return { name: textOf(o.name), description: textOf(o.description), attributes, json };
}

/** The Collection's reads the screens use. `RpcCollectionViews` calls the contract; tests give a fake. */
export interface CollectionViews {
  tokenUri(tokenId: bigint): Promise<string>;
  ownerOf(tokenId: bigint): Promise<string>;
}

export class RpcCollectionViews implements CollectionViews {
  private readonly codec = new AbiCodec(COLLECTION_ABI);

  constructor(
    private readonly provider: CallProvider,
    private readonly address: string,
  ) {}

  async tokenUri(tokenId: bigint): Promise<string> {
    return (await this.call("token_uri", tokenId)) as string;
  }

  async ownerOf(tokenId: bigint): Promise<string> {
    return (await this.call("owner_of", tokenId)) as string;
  }

  private async call(entrypoint: "token_uri" | "owner_of", tokenId: bigint): Promise<unknown> {
    if (!this.address) throw new ViewError("not-configured", "Collection address is not configured");
    try {
      const felts = await this.provider.callContract({ contractAddress: this.address, entrypoint, calldata: this.codec.encodeCall(entrypoint, [tokenId]) });
      return this.codec.decodeResult(entrypoint, felts);
    } catch (error) {
      throw toViewError(error);
    }
  }
}

/** In-memory Collection for tests: token id to its URI and owner. */
export class FakeCollectionViews implements CollectionViews {
  readonly uris = new Map<string, string>();
  readonly owners = new Map<string, string>();
  calls: string[] = [];

  async tokenUri(tokenId: bigint): Promise<string> {
    this.calls.push(`token_uri ${tokenId}`);
    const uri = this.uris.get(tokenId.toString());
    if (uri === undefined) throw new ViewError("rpc", "Collection: invalid token ID");
    return uri;
  }

  async ownerOf(tokenId: bigint): Promise<string> {
    this.calls.push(`owner_of ${tokenId}`);
    const owner = this.owners.get(tokenId.toString());
    if (owner === undefined) throw new ViewError("rpc", "Collection: invalid token ID");
    return owner;
  }
}
