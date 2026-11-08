/** A social page's word when its source is not on the network (the mock serves them all). */
export function SocialUnavailable({ children }: { children: string }) {
  return <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">{children}</p>;
}
