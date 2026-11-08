import type { ChatEncryption } from "../../data/social-source";
import { JOINER_LINE, encryptionLine, encryptionSheetLines, keyChangedLine } from "../../lib/chat-text";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { HudDrawer } from "./hud-drawer";

// End-to-end encryption on the pages (#997): the line at the top of each conversation, the joiner's line, the other's key change,
// and the Encryption sheet with the safety code. The page head (`ChatPage.encryption`) says what to show.

export interface EncryptionLineProps {
  mode: ChatEncryption["mode"];
  /** The other player's name in words, in a private conversation. */
  otherName: string;
  /** A private conversation: the line opens the Encryption sheet. */
  onOpen?: () => void;
  /** Its place's look (CHAT-PAGE: a private conversation's opening draws it as a pill). */
  className?: string;
}

/**
 * What a conversation's encryption is, in a line at its top (#997, point 8): a lock and who can read it (private, the guild), or
 * that the World is public. In private it is a button that opens the Encryption sheet. A long name wraps rather than being cut.
 */
export function EncryptionLine({ mode, otherName, onOpen, className }: EncryptionLineProps) {
  // The icon in the text's flow, so that it stays beside the first words when the line wraps, centred with them.
  const body = (
    <span className="min-w-0 wrap-anywhere">
      <Icon name={mode === "public" ? "users" : "lock"} size="xs" className="mr-1.5" />
      {encryptionLine(mode, otherName)}
    </span>
  );
  const cls = cn("block w-full min-w-0 px-3 py-1.5 text-center text-xs text-muted-foreground", className);
  if (mode === "private" && onOpen)
    return (
      <button type="button" data-slot="chat-encryption-line" data-mode={mode} onClick={onOpen} className={cn(cls, "state-layer outline-none")}>
        {body}
      </button>
    );
  return (
    <p data-slot="chat-encryption-line" data-mode={mode} className={cls}>
      {body}
    </p>
  );
}

/** The joiner's line, at the start of the guild's conversation (#997, open point 2): what they cannot read. */
export function JoinerLine() {
  return (
    <p data-slot="chat-joiner-line" className="px-3 py-1 text-center text-xs text-muted-foreground italic">
      {JOINER_LINE}
    </p>
  );
}

export interface KeyChangeLineProps {
  otherName: string;
  /** Opens the Encryption sheet, on the new key's safety code. */
  onViewCode?: () => void;
}

/** The other player's key changed (#997, point 10): a line among the messages, with "View code". */
export function KeyChangeLine({ otherName, onViewCode }: KeyChangeLineProps) {
  return (
    <span className="max-w-full rounded-2xl bg-secondary/60 px-3 py-1 text-center text-xs text-muted-foreground wrap-anywhere">
      <Icon name="arrows-rotate" size="xs" className="mr-1.5" />
      {keyChangedLine(otherName)}
      {onViewCode && (
        <Button size="sm" variant="link" className="ml-1 inline-flex h-auto min-h-6 px-1 py-0 align-middle text-xs" onClick={onViewCode}>
          View code
        </Button>
      )}
    </span>
  );
}

export interface EncryptionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The other player's name in words. */
  otherName: string;
  /** Both players' current keys' safety code (20 digits in 4 groups of 5), or null while one of them has no key. */
  safetyCode: string | null;
}

/**
 * The Encryption sheet of a private conversation (#997, point 9, open point 4): what is encrypted, in two lines, and the safety
 * code. Two players who compare it in person, and find it the same, know nobody stands between them. DRAWER-NAV-IN-PLACE (#1064, open
 * point 1's default: a page of text): in the chat's drawer, in its place, with Back to the conversation; alone, its own drawer.
 */
export function EncryptionSheet({ open, onOpenChange, otherName, safetyCode }: EncryptionSheetProps) {
  const [first, second] = encryptionSheetLines(otherName);
  return (
    <HudDrawer open={open} onOpenChange={onOpenChange} title="Encryption" side="right" slot="chat-encryption" inPlace>
      <div data-slot="chat-encryption" className="flex flex-col gap-3">
        <div className="flex items-start gap-2">
          <Icon name="lock" size="sm" className="mt-0.5 text-primary" />
          <div className="flex min-w-0 flex-col gap-1.5">
            <p className="text-sm font-semibold wrap-anywhere">{first}</p>
            <p className="text-sm text-muted-foreground">{second}</p>
          </div>
        </div>
        <section aria-label="Safety code" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold">Safety code</h3>
          {safetyCode ? (
            <>
              <p data-slot="chat-safety-code" aria-label={`Safety code ${safetyCode}`} className="grid grid-cols-2 justify-items-center gap-x-4 gap-y-2 font-mono text-lg tracking-widest tablet:grid-cols-4">
                {safetyCode.split(" ").map((group, i) => (
                  <span key={i} aria-hidden className="numeric whitespace-nowrap">
                    {group}
                  </span>
                ))}
              </p>
              <p className="text-sm text-muted-foreground wrap-anywhere">Compare it with {otherName} in person. If you both see the same code, nobody stands between you.</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">The code shows once both of you have a security key.</p>
          )}
        </section>
      </div>
    </HudDrawer>
  );
}
