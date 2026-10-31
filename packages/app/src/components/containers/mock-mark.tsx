import { createContext, useContext } from "react";
import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";

/** What the mark says on hover and to a screen reader. */
export const MOCK_MARK_TEXT = "This network's contracts are not up to date yet: the Challenge's games, the tokens, the Vault, the Cobbles, the missions' rewards, the packs and the skins are mocked on this device.";

/**
 * The small mark that part of the data is mocked (#549, MOCK-FIRST): a pill on the line of a page's title, reading "Mock" (#622), or
 * of a board's HUD (`GameHud`): since #927 the Challenge's games, their moves, purchase and settlement are the mock's too.
 */
export function MockMark({ className }: { className?: string }) {
  return (
    <Badge variant="outline" title={MOCK_MARK_TEXT} aria-label={`Mock. ${MOCK_MARK_TEXT}`} className={cn("border-warning/40 text-warning", className)}>
      Mock
    </Badge>
  );
}

/** Whether the shell's data source is the mock: the shell sets it (`data-source.ts`); absent (stories, tests) it is false. */
const MockedContext = createContext(false);
export const MockMarkProvider = MockedContext.Provider;
/** Whether the shell says the data is mocked: for a header that makes room for the mark. */
export const useMockMarked = () => useContext(MockedContext);

/** The mark where a page's header puts it, drawn only while the shell says the data is mocked. */
export function MockMarkSlot({ className }: { className?: string }) {
  return useContext(MockedContext) ? <MockMark className={className} /> : null;
}
