// Shared inline styles of the economy panels (the landing's panels use inline styles, as PrizePanel).
export const panel = { background: "rgba(0,0,0,0.75)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column" as const, gap: 8, color: "#f5f5f5", fontSize: 13 };
export const button = { border: "1px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.08)", color: "#fff", borderRadius: 8, padding: "6px 10px", cursor: "pointer" };
export const confirmButton = { ...button, background: "#f59e0b", color: "#0a0a0a", border: "none" };
export const input = { flex: 1, background: "#111", color: "#fff", border: "1px solid #555", borderRadius: 6, padding: "4px 8px" };
export const warning = { color: "#fbbf24" };
export const alert = { color: "#fecaca" };
