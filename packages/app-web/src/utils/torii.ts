/** Pad address to 66-char 0x-prefixed format (0x + 64 hex) to match Torii storage */
export function padAddress(address: string): string {
  const hex = address.replace(/^0x/, "");
  return "0x" + hex.padStart(64, "0");
}

/** Convert a felt hex string to a UTF-8 string */
export function feltToString(felt: string): string {
  const hex = felt.replace(/^0x0*/, "");
  if (!hex) return "Player";
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substring(i, i + 2), 16));
  }
  return String.fromCharCode(...bytes);
}

/** Safely parse a Torii boolean field. Torii may return 0/1, "0"/"1", true/false, or "true"/"false".
 *  Boolean("0") is true in JS, so we must handle this explicitly. */
export function parseToriiBool(val: unknown): boolean {
  if (typeof val === "boolean") return val;
  if (typeof val === "number") return val !== 0;
  if (typeof val === "string") return val !== "0" && val !== "false" && val !== "";
  return Boolean(val);
}

/** Query Torii SQL endpoint */
export async function toriiQuery(toriiUrl: string, sql: string): Promise<any[]> {
  try {
    const res = await fetch(toriiUrl + "/sql", { method: "POST", body: sql });
    return res.json();
  } catch {
    return [];
  }
}
