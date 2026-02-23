import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Stack, Text } from "tamagui";
import { DialogOverlay, DialogContent, DialogTitle, DialogDescription } from "../components/Dialog";
import { Button, ButtonText } from "../components/Button";
export function GameCompleteDialog({ score, onClose, onScreenshot, visible = false, }) {
    if (!visible)
        return null;
    return (_jsx(DialogOverlay, { children: _jsxs(DialogContent, { children: [_jsx(DialogTitle, { children: "Game Complete!" }), _jsx(DialogDescription, { children: "Final Score" }), _jsx(Text, { fontSize: "$8", fontWeight: "700", fontFamily: "$heading", color: "$primary", textAlign: "center", children: score.toLocaleString() }), _jsxs(Stack, { flexDirection: "row", gap: "$3", justifyContent: "center", children: [onScreenshot && (_jsx(Button, { variant: "ghost", onPress: onScreenshot, children: _jsx(ButtonText, { children: "Screenshot" }) })), _jsx(Button, { onPress: onClose, children: _jsx(ButtonText, { children: "Continue" }) })] })] }) }));
}
//# sourceMappingURL=GameCompleteDialog.js.map