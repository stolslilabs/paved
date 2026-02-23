import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Stack, Text } from "tamagui";
export function IngameStatus({ score, built, totalTiles, discarded, }) {
    return (_jsxs(Stack, { gap: "$2", padding: "$3", children: [_jsx(Text, { fontSize: "$5", fontWeight: "700", fontFamily: "$heading", color: "$primary", children: score.toLocaleString() }), _jsxs(Stack, { flexDirection: "row", gap: "$4", children: [_jsxs(Stack, { flexDirection: "row", alignItems: "center", gap: "$1", children: [_jsx(Text, { color: "$muted", fontSize: "$1", children: "Built" }), _jsxs(Text, { color: "$color", fontSize: "$2", fontWeight: "700", children: [built, "/", totalTiles] })] }), _jsxs(Stack, { flexDirection: "row", alignItems: "center", gap: "$1", children: [_jsx(Text, { color: "$muted", fontSize: "$1", children: "Discarded" }), _jsx(Text, { color: "$error", fontSize: "$2", fontWeight: "700", children: discarded })] })] })] }));
}
//# sourceMappingURL=IngameStatus.js.map