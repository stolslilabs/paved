import type { PageDef } from "./pages";

/** An empty page: its title, and nothing else until its phase (section 12). */
export function Placeholder({ page }: { page: PageDef }) {
  return (
    <section data-testid="page" data-path={page.path || "/"} className="p-4">
      <h1 className="font-display text-xl text-foreground mobile:text-2xl">{page.title}</h1>
    </section>
  );
}
