import { InlineError, type InlineErrorProps } from "../elements/inline-error";
import { Button } from "../ui/button";
import { toast } from "../ui/sonner";

/** An error toast's content: the message is required, the rest is `InlineError`'s. */
export type ErrorToastProps = Omit<InlineErrorProps, "message" | "action"> & { message: string };

/** Long enough to reach Copy; Close ends it sooner. */
const ERROR_TOAST_MS = 10_000;

/**
 * An error that has no place on its page (a failed claim, a free game that did not start, the wallet's connect) said in
 * a toast (P-67): the toast holds the one error component, its Copy and its detail, and a Close; never Sonner's own error
 * style. The `Toaster` is the app's (`App.tsx`).
 */
export function toastError(props: ErrorToastProps) {
  return toast.custom(
    (id) => (
      <div data-slot="error-toast" className="w-(--width) max-w-full rounded-lg bg-popover shadow-lg">
        {/* At its height from the first frame: Sonner measures a custom toast on mount, so a grow-in would stack it wrong. */}
        <InlineError
          {...props}
          animateIn={false}
          action={
            <Button size="sm" variant="ghost" onClick={() => toast.dismiss(id)}>
              Close
            </Button>
          }
        />
      </div>
    ),
    { duration: ERROR_TOAST_MS },
  );
}
