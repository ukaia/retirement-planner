type Props = {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  disabled?: boolean;
};

export function Toggle({ checked, onChange, label, disabled }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 group"
    >
      <span
        className={[
          "inline-flex h-5 w-9 items-center rounded-full transition-colors",
          checked ? "bg-accent" : "bg-border-strong",
        ].join(" ")}
      >
        <span
          className={[
            "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-4" : "translate-x-0.5",
          ].join(" ")}
        />
      </span>
      {label ? (
        <span className="text-sm text-fg group-disabled:text-subtle">{label}</span>
      ) : null}
    </button>
  );
}
