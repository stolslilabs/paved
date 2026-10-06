import { hash, num } from "starknet";

/** One entry of a Cairo ABI, as in `contracts/abis/<Contract>.json`. */
export interface AbiEntry {
  type: string;
  name: string;
  inputs?: Array<{ name: string; type: string }>;
  outputs?: Array<{ type: string }>;
  items?: AbiEntry[];
  members?: Array<{ name: string; type: string; kind?: string }>;
  variants?: Array<{ name: string; type: string; kind?: string }>;
  kind?: string;
  state_mutability?: string;
}

export type Abi = readonly AbiEntry[];

/** A decoded value: felts and addresses are 0x-hex strings, small integers numbers, wide ones bigints. */
export type Decoded = string | number | bigint | boolean | Decoded[] | { [field: string]: Decoded };

export type Encodable = string | number | bigint | boolean;

/** The felts of a result do not match the ABI (e.g. a contract upgraded with a grown struct). */
export class AbiMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AbiMismatchError";
  }
}

const INT_BITS: Record<string, number> = {
  "core::integer::u8": 8,
  "core::integer::u16": 16,
  "core::integer::u32": 32,
  "core::integer::u64": 64,
  "core::integer::u128": 128,
};
/** The field prime P: a felt is in [0, P). */
const FELT_P = (1n << 251n) + 17n * (1n << 192n) + 1n;

/** An event decoded from its keys and data; field names are camelCase. */
export interface DecodedEvent {
  /** Short event name, e.g. `GameSpawned`. */
  name: string;
  fields: Record<string, Decoded>;
  fromAddress: string;
  blockNumber?: number;
  transactionHash?: string;
}

export interface RawEvent {
  keys: string[];
  data: string[];
  from_address?: string;
  block_number?: number;
  transaction_hash?: string;
}

const SMALL_INTS = new Set([
  "core::integer::u8",
  "core::integer::u16",
  "core::integer::u32",
  "core::integer::u64",
]);
const FELT_LIKE = new Set([
  "core::felt252",
  "core::starknet::contract_address::ContractAddress",
  "core::starknet::class_hash::ClassHash",
]);
const U128 = "core::integer::u128";
const U256 = "core::integer::u256";
const BOOL = "core::bool";
const ARRAY = /^core::array::(?:Array|Span)::<(.+)>$/;

export function camelCase(name: string): string {
  return name.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

export function shortName(path: string): string {
  const parts = path.split("::");
  return parts[parts.length - 1];
}

/** Selector of an entry point or event name (`starknet_keccak`), as 0x-hex. */
export function selector(name: string): string {
  return toHex(hash.getSelectorFromName(name));
}

/** Same address whatever the padding or case. */
export function sameAddress(a: string | bigint, b: string | bigint): boolean {
  return BigInt(a) === BigInt(b);
}

export function toHex(value: string | number | bigint): string {
  return num.toHex(value);
}

/**
 * Encodes calldata and decodes results and events from a contract's ABI. Covers the types the
 * Paved ABIs use: integers, felts, addresses, bool, u256, unit enums, structs, arrays.
 */
export class AbiCodec {
  private readonly functions = new Map<string, AbiEntry>();
  private readonly structs = new Map<string, NonNullable<AbiEntry["members"]>>();
  private readonly enums = new Map<string, NonNullable<AbiEntry["variants"]>>();
  private readonly events = new Map<string, { name: string; members: NonNullable<AbiEntry["members"]> }>();

  constructor(readonly abi: Abi) {
    const visit = (entry: AbiEntry) => {
      if (entry.type === "function") this.functions.set(entry.name, entry);
      else if (entry.type === "interface") entry.items?.forEach(visit);
      else if (entry.type === "struct") this.structs.set(entry.name, entry.members ?? []);
      else if (entry.type === "enum") this.enums.set(entry.name, entry.variants ?? []);
      else if (entry.type === "event" && entry.kind === "struct") {
        // Every Paved event is flattened into its contract's enum: key 0 is the selector of its short name.
        const name = shortName(entry.name);
        this.events.set(toHex(hash.getSelectorFromName(name)), { name, members: entry.members ?? [] });
      }
    };
    abi.forEach(visit);
  }

  hasFunction(name: string): boolean {
    return this.functions.has(name);
  }

  /** Member names of a struct of the ABI, in order, camelCased. */
  structFields(structName: string): string[] {
    const members = this.structs.get(structName);
    if (!members) throw new Error(`ABI has no struct ${structName}`);
    return members.map((m) => camelCase(m.name));
  }

  /** Selector of an event of the ABI (key 0 of its emitted events). */
  eventSelector(name: string): string {
    for (const [selector, event] of this.events) if (event.name === name) return selector;
    throw new Error(`ABI has no event ${name}`);
  }

  /** Calldata of a function, from its arguments in order. */
  encodeCall(fnName: string, args: Encodable[]): string[] {
    const fn = this.function(fnName);
    const inputs = fn.inputs ?? [];
    if (inputs.length !== args.length) {
      throw new Error(`${fnName} takes ${inputs.length} arguments, got ${args.length}`);
    }
    const out: string[] = [];
    inputs.forEach((input, i) => this.encode(input.type, args[i], out));
    return out;
  }

  /** The first output of a function, decoded from the felts a call returned. */
  decodeResult(fnName: string, felts: string[]): Decoded {
    const output = this.function(fnName).outputs?.[0];
    if (!output) return [];
    const cursor = { felts: felts.map((f) => BigInt(f)), at: 0 };
    let value: Decoded;
    try {
      value = this.decode(output.type, cursor);
    } catch (error) {
      throw new AbiMismatchError(`${fnName}: ${error instanceof Error ? error.message : String(error)}`);
    }
    // Felts left over mean the contract returns more than this ABI says: refuse rather than misalign.
    if (cursor.at !== cursor.felts.length) {
      throw new AbiMismatchError(`${fnName}: ${cursor.felts.length - cursor.at} felts left over after ${output.type}`);
    }
    return value;
  }

  /** Decodes an emitted event, or returns null when it is not an event of this ABI or cannot be decoded. */
  decodeEvent(raw: RawEvent): DecodedEvent | null {
    if (raw.keys.length === 0) return null;
    const event = this.events.get(toHex(raw.keys[0]));
    if (!event) return null;
    const keys = { felts: raw.keys.slice(1).map((f) => BigInt(f)), at: 0 };
    const data = { felts: raw.data.map((f) => BigInt(f)), at: 0 };
    const fields: Record<string, Decoded> = {};
    try {
      for (const member of event.members) {
        fields[camelCase(member.name)] = this.decode(member.type, member.kind === "key" ? keys : data);
      }
    } catch (error) {
      // A field type this codec does not know (an event added to the ABI later): skip the event
      // rather than fail the whole receipt or event page.
      console.warn(`paved codec: skipped event ${event.name}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
    return {
      name: event.name,
      fields,
      fromAddress: raw.from_address ?? "",
      blockNumber: raw.block_number,
      transactionHash: raw.transaction_hash,
    };
  }

  private function(name: string): AbiEntry {
    const fn = this.functions.get(name);
    if (!fn) throw new Error(`ABI has no function ${name}`);
    return fn;
  }

  private encode(type: string, value: Encodable, out: string[]): void {
    if (type === BOOL) {
      out.push(value === true || value === 1 || value === "1" || value === 1n ? "0x1" : "0x0");
      return;
    }
    if (type === U256) {
      const v = BigInt(value as string | number | bigint);
      if (v < 0n || v >= 1n << 256n) throw new RangeError(`${String(value)} is out of range for ${type}`);
      out.push(toHex(v & ((1n << 128n) - 1n)), toHex(v >> 128n));
      return;
    }
    if (SMALL_INTS.has(type) || FELT_LIKE.has(type) || type === U128) {
      const v = BigInt(value as string | number | bigint);
      const bits = INT_BITS[type];
      if (v < 0n || (bits ? v >= 1n << BigInt(bits) : v >= FELT_P)) throw new RangeError(`${String(value)} is out of range for ${type}`);
      out.push(toHex(v));
      return;
    }
    const variants = this.enums.get(type);
    if (variants) {
      // Unit enums only (Orientation, Role, Spot): the calldata is the variant index.
      const index = Number(value);
      if (!Number.isInteger(index) || index < 0 || index >= variants.length) {
        throw new Error(`${type} has no variant ${String(value)}`);
      }
      out.push(toHex(index));
      return;
    }
    throw new Error(`Cannot encode ${type}`);
  }

  private decode(type: string, cursor: { felts: bigint[]; at: number }): Decoded {
    const next = () => {
      if (cursor.at >= cursor.felts.length) throw new Error(`Not enough felts to decode ${type}`);
      return cursor.felts[cursor.at++];
    };
    if (type === BOOL) return next() !== 0n;
    if (SMALL_INTS.has(type)) {
      const v = next();
      return v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v;
    }
    if (FELT_LIKE.has(type)) return toHex(next());
    if (type === U128) return next();
    if (type === U256) {
      const low = next();
      const high = next();
      return low + (high << 128n);
    }
    const array = ARRAY.exec(type);
    if (array) {
      const length = Number(next());
      const items: Decoded[] = [];
      for (let i = 0; i < length; i++) items.push(this.decode(array[1], cursor));
      return items;
    }
    const members = this.structs.get(type);
    if (members) {
      const value: Record<string, Decoded> = {};
      for (const m of members) value[camelCase(m.name)] = this.decode(m.type, cursor);
      return value;
    }
    const variants = this.enums.get(type);
    if (variants) {
      const index = Number(next());
      const variant = variants[index];
      if (!variant) throw new Error(`${type} has no variant ${index}`);
      if (variant.type !== "()") throw new Error(`Cannot decode the payload of ${type}::${variant.name}`);
      return index;
    }
    throw new Error(`Cannot decode ${type}`);
  }
}
