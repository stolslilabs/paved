import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Stack } from "tamagui";
import { Button, ButtonText } from "../components/Button";
export function HandPanel({ onRotate, onConfirm, confirmDisabled = false, }) {
    return (_jsxs(Stack, { flexDirection: "row", gap: "$3", padding: "$3", alignItems: "center", children: [_jsx(Button, { variant: "ghost", onPress: onRotate, children: _jsx(ButtonText, { children: "Rotate" }) }), _jsx(Button, { disabled: confirmDisabled, onPress: onConfirm, children: _jsx(ButtonText, { children: "Confirm" }) })] }));
}
//# sourceMappingURL=HandPanel.js.map