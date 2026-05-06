type Option<T extends string> = { value: T; label: string };

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (next: T) => void;
  options: Option<T>[];
}) {
  return (
    <div className="inline-flex rounded-md border border-border bg-surface p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={[
              "px-3 py-1 text-xs rounded-sm transition-colors",
              active ? "bg-surface-2 text-fg font-medium" : "text-muted hover:text-fg",
            ].join(" ")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
