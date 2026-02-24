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

/** Query Torii SQL endpoint */
export async function toriiQuery(toriiUrl: string, sql: string): Promise<any[]> {
  try {
    const res = await fetch(toriiUrl + "/sql", { method: "POST", body: sql });
    return res.json();
  } catch {
    return [];
  }
}
