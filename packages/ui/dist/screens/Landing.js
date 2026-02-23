import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Stack, Text } from "tamagui";
import { Button, ButtonText } from "../components/Button";
export function LandingScreen({ playerName, onSpawn, onPlay, connected = false, }) {
    return (_jsxs(Stack, { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "$background", gap: "$6", padding: "$6", children: [_jsx(Text, { fontSize: "$9", fontWeight: "700", fontFamily: "$heading", color: "$primary", children: "PAVED" }), _jsx(Text, { fontSize: "$3", color: "$muted", textAlign: "center", children: "A Carcassonne-style on-chain tile game" }), connected ? (playerName ? (_jsx(Button, { onPress: onPlay, children: _jsxs(ButtonText, { children: ["Play as ", playerName] }) })) : (_jsx(Button, { onPress: onSpawn, children: _jsx(ButtonText, { children: "Create Account" }) }))) : (_jsx(Text, { color: "$muted", children: "Connect your wallet to begin" }))] }));
}
//# sourceMappingURL=Landing.js.map