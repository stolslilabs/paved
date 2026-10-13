/** The text a React element tree holds, walking function components with their props: enough for a presentational card. */
export function collectText(node: unknown): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(collectText).join(" ");
  const element = node as { type?: unknown; props?: { children?: unknown } };
  return collectText(element.props?.children);
}
