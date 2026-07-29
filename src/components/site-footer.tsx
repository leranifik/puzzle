import type { Dictionary } from "@/i18n/get-dictionary";

export function SiteFooter({ dict }: { dict: Dictionary }) {
  return (
    <footer className="mt-auto border-t border-surface/60 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-4 sm:flex-row sm:items-center sm:px-6">
        <p className="font-display text-sm text-foreground">
          Puzzle<span className="text-gold">Hub</span>{" "}
          <span className="font-body text-muted-foreground">— {dict.footer.tagline}</span>
        </p>
        <p className="label-mono text-muted-foreground">{dict.footer.rights}</p>
      </div>
    </footer>
  );
}
