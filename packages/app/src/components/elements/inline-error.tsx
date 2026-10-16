import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";

/** What support needs beside the message: each part the host knows, none read here (P-67). */
export interface ErrorDetail {
  /** The typed error's name (`SpawnPausedError`) or an error code. */
  code?: string;
  /** The transaction the error came back from. */
  txHash?: string;
  gameId?: number | string;
  /** The app's version (`package.json`). */
  version?: string;
  /** When the error was first shown, in ms since the epoch: copied as UTC (ISO 8601). */
  at?: number;
}

export interface InlineErrorProps {
  /** The error, as plain text: shown, and copied. Null or empty: nothing is shown and the space folds away. */
  message: string | null | undefined;
  /** A short heading, read before the message ("Settle refused"). */
  title?: string;
  /** The message with markup (amounts); `message` stays its plain text, for the copy and the tooltip. */
  children?: ReactNode;
  detail?: ErrorDetail;
  /** A way out beside Copy: Retry, Dismiss. */
  action?: ReactNode;
  /** Copies the text; the clipboard by default. A throw or a rejection is a failed copy. */
  onCopy?: (text: string) => void | Promise<void>;
  /** Starts as just copied, or as a failed copy (the `Copied` and `CopyFailed` stories). */
  defaultCopy?: CopyState;
  /** False: shown at its height from the first frame, no grow-in (a toast, which Sonner measures on mount). */
  animateIn?: boolean;
  className?: string;
}

/** The plain text the Copy button puts on the clipboard: the message, then one line per known detail. */
export function errorReport({ title, message, detail }: Pick<InlineErrorProps, "title" | "message" | "detail">): string {
  const lines = [title ? `${title}: ${message ?? ""}` : (message ?? "")];
  if (detail?.code) lines.push(`Error: ${detail.code}`);
  if (detail?.txHash) lines.push(`Transaction: ${detail.txHash}`);
  if (detail?.gameId !== undefined) lines.push(`Game: ${detail.gameId}`);
  if (detail?.version) lines.push(`Version: ${detail.version}`);
  if (detail?.at !== undefined) lines.push(`First shown (UTC): ${new Date(detail.at).toISOString()}`);
  return lines.join("\n");
}

const COPIED_MS = 2000;

export type CopyState = "idle" | "copied" | "failed";

/** The clipboard, or a failure without it (an insecure origin, an old browser): the caller then shows the text to select. */
function copyToClipboard(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) return Promise.reject(new Error("No Clipboard API"));
  return navigator.clipboard.writeText(text);
}

/**
 * Every error of the app (P-67): one look (the alert icon, `text-sm`, the error token), two lines at most then an
 * ellipsis (the whole text in the tooltip and for screen readers), a Copy button with the detail for support ("Copied" on
 * success; on a failure the full text shown, selected, to copy by hand), and a height that animates as it appears,
 * changes or goes (none under reduced motion). Hosts render it always, with `message` null when there is no error: it
 * takes no space then (nothing is rendered once the fold ends, so a flex or grid `gap` is not added for it). There is no
 * other error rendering.
 */
export function InlineError({ message, title, children, detail, action, onCopy = copyToClipboard, defaultCopy = "idle", animateIn = true, className }: InlineErrorProps) {
  const reduced = useReducedMotionConfig();
  const open = Boolean(message);
  // Mounted while open and while its space folds away; then nothing, so no gap is left.
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  if (!open && mounted && reduced) setMounted(false);
  // Gone at once when the error clears; only the space it took folds away.
  const shown = open ? { message, title, children, detail, action } : null;
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | "auto">("auto");
  const [moving, setMoving] = useState(false);
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    setHeight(el.getBoundingClientRect().height);
    const observer = new ResizeObserver(() => setHeight(el.getBoundingClientRect().height));
    observer.observe(el);
    return () => observer.disconnect();
  }, [shown !== null, mounted]);

  const [copy, setCopy] = useState<CopyState>(defaultCopy);
  useEffect(() => {
    if (copy !== "copied" || defaultCopy === "copied") return;
    const id = setTimeout(() => setCopy("idle"), COPIED_MS);
    return () => clearTimeout(id);
  }, [copy, defaultCopy]);
  // A failed copy shows the whole text, selected: the player copies it by hand.
  const fallback = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (copy === "failed" && defaultCopy !== "failed") fallback.current?.select();
  }, [copy, defaultCopy]);

  if (!mounted) return null;
  const text = shown ? errorReport(shown) : "";
  const full = shown ? (shown.title ? `${shown.title}: ${shown.message}` : (shown.message ?? "")) : "";
  const copied = copy === "copied";
  return (
    <m.div
      data-slot="inline-error"
      initial={animateIn ? { height: 0 } : false}
      animate={{ height: open ? height : 0 }}
      transition={{ duration: reduced ? 0 : 0.18, ease: "easeOut" }}
      onAnimationStart={() => setMoving(true)}
      onAnimationComplete={() => {
        setMoving(false);
        if (!open) setMounted(false);
      }}
      // Clipped only while the height moves: a settled error is never cut.
      className={cn((moving || !open) && "overflow-hidden", className)}
    >
      {shown && (
        <div ref={inner} role="alert" className="flex items-start gap-2 rounded-lg border border-destructive px-3 py-2 font-sans text-sm text-destructive-text">
          <span className="inline-flex h-5 shrink-0 items-center">
            <Icon name="triangle-exclamation" size="sm" fixedWidth />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            {/* A copy target (APP-FEEL, P-69: the app is `select-none` elsewhere). */}
            <p title={full} className="line-clamp-2 wrap-anywhere select-text">
              {shown.title && (
                <>
                  <span className="font-semibold">{shown.title}</span>
                  {": "}
                </>
              )}
              <span>{shown.children ?? shown.message}</span>
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {shown.action}
              <Button
                size="sm"
                variant="outline"
                aria-label={copied ? "Copied" : "Copy the error"}
                onClick={() => {
                  Promise.resolve()
                    .then(() => onCopy(text))
                    .then(
                      () => setCopy("copied"),
                      () => setCopy("failed"),
                    );
                }}
              >
                <Icon name={copied ? "check" : "copy"} size="xs" />
                {copied ? "Copied" : "Copy"}
              </Button>
              <span role="status" className={copy === "failed" ? "text-xs" : "sr-only"}>
                {copied ? "The error is copied" : copy === "failed" ? "Copy failed: select the text" : ""}
              </span>
            </div>
            {copy === "failed" && (
              <textarea
                ref={fallback}
                readOnly
                aria-label="The error, to copy"
                value={text}
                rows={Math.min(6, text.split("\n").length)}
                className="w-full resize-none rounded-md border border-input bg-transparent px-2 py-1 font-mono text-xs text-foreground"
              />
            )}
          </div>
        </div>
      )}
    </m.div>
  );
}
