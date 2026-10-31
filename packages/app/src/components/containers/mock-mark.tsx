import { createContext, useContext } from "react";
import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";

/** What the mark says on hover and to a screen reader. */
export const MOCK_MARK_TEXT = "This client runs on this device's data alone: every game, token, player and page is mocked here.";

/**
 * The small mark that the data is mocked (#549, MOCK-FIRST): a pill on the line of a page's title, reading "Mock" (#622), or of a
 * board's HUD (`GameHud`). Since #927 every page is the mock's: the client runs on the device's data alone.
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
