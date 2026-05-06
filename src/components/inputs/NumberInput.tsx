import { useEffect, useState } from "react";

type Props = {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  prefix?: string;
  suffix?: string;
  disabled?: boolean;
  /** display as percent (input shows 5, internally stores 0.05). */
  asPercent?: boolean;
  placeholder?: string;
};

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
  prefix,
  suffix,
  disabled,
  asPercent,
  placeholder,
}: Props) {
  const display = asPercent ? Math.round(value * 10000) / 100 : value;
  const [text, setText] = useState<string>(String(display));

  useEffect(() => {
    setText(String(asPercent ? Math.round(value * 10000) / 100 : value));
  }, [value, asPercent]);

  return (
    <div className="relative">
      {prefix ? (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-subtle pointer-events-none">
          {prefix}
        </span>
      ) : null}
      <input
        type="number"
        inputMode="decimal"
        className={`input ${prefix ? "pl-7" : ""} ${suffix ? "pr-9" : ""}`}
        value={text}
        min={min}
        max={max}
        step={step ?? (asPercent ? 0.1 : 1)}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          const n = parseFloat(e.target.value);
          if (!isNaN(n)) {
            const final = asPercent ? n / 100 : n;
            onChange(final);
          } else if (e.target.value === "") {
            onChange(0);
          }
        }}
        onBlur={(e) => {
          if (e.target.value === "" || isNaN(parseFloat(e.target.value))) {
            const reset = asPercent ? Math.round(value * 10000) / 100 : value;
            setText(String(reset));
          }
        }}
      />
      {suffix ? (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-subtle pointer-events-none">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}
