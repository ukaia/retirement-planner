import type { ReactNode } from "react";
import { GLOSSARY } from "@/lib/tooltips";

type Props = {
  k: keyof typeof GLOSSARY;
  children?: ReactNode;
};

export function Term({ k, children }: Props) {
  const entry = GLOSSARY[k];
  if (!entry) return <>{children ?? k}</>;
  return (
    <span
      tabIndex={0}
      className="relative inline-block underline decoration-dotted decoration-subtle underline-offset-2 cursor-help group"
      aria-label={entry.term}
    >
      {children ?? entry.term}
      <span
        role="tooltip"
        className="
          pointer-events-none
          absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5
          z-20 w-64 max-w-[80vw]
          rounded-md border border-border bg-surface text-fg
          p-2.5 text-[11px] leading-snug
          shadow-card
          opacity-0 group-hover:opacity-100 group-focus-within:opacity-100
          transition-opacity
        "
      >
        <span className="block font-medium text-fg">{entry.term}</span>
        <span className="block text-muted mt-0.5">{entry.definition}</span>
        {entry.source ? (
          <span className="block text-subtle mt-1 text-[10px]">{entry.source}</span>
        ) : null}
      </span>
    </span>
  );
}
