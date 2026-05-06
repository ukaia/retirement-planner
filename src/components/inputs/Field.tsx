import type { ReactNode } from "react";

export function Field({
  label,
  hint,
  children,
  trailing,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-xs font-medium text-muted">{label}</span>
        {trailing}
      </div>
      {children}
      {hint ? <div className="mt-1 text-[11px] text-subtle">{hint}</div> : null}
    </label>
  );
}

export function FieldGrid({ children, cols = 2 }: { children: ReactNode; cols?: 1 | 2 | 3 }) {
  const colsClass = cols === 1 ? "grid-cols-1" : cols === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-3";
  return <div className={`grid ${colsClass} gap-4`}>{children}</div>;
}

export function Card({ children, title, subtitle, action }: { children: ReactNode; title?: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="card">
      {(title || subtitle || action) && (
        <div className="flex items-start justify-between mb-4">
          <div>
            {title ? <div className="section-title">{title}</div> : null}
            {subtitle ? <div className="section-subtitle mt-0.5">{subtitle}</div> : null}
          </div>
          {action ? <div>{action}</div> : null}
        </div>
      )}
      <div className="space-y-4">{children}</div>
    </div>
  );
}
