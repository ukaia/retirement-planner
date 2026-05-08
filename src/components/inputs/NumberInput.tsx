import { useCallback, useEffect, useRef, useState } from "react";

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
  /** trailing-debounce delay for committing typed values; flush on blur/Enter. */
  debounceMs?: number;
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
  debounceMs = 250,
}: Props) {
  const display = asPercent ? Math.round(value * 10000) / 100 : value;
  const [text, setText] = useState<string>(String(display));

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const pendingRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (pendingRef.current !== null) {
      const v = pendingRef.current;
      pendingRef.current = null;
      onChangeRef.current(v);
    }
  }, []);

  const schedule = useCallback(
    (v: number) => {
      pendingRef.current = v;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      if (debounceMs <= 0) {
        flush();
        return;
      }
      timerRef.current = window.setTimeout(flush, debounceMs);
    },
    [debounceMs, flush],
  );

  // Sync local text when external value changes — but only when no edit is pending,
  // otherwise typing would be clobbered by the round-tripped store value.
  useEffect(() => {
    if (pendingRef.current !== null) return;
    setText(String(asPercent ? Math.round(value * 10000) / 100 : value));
  }, [value, asPercent]);

  // Flush any pending value on unmount so we never drop a user edit.
  useEffect(() => () => flush(), [flush]);

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
            schedule(asPercent ? n / 100 : n);
          } else if (e.target.value === "") {
            schedule(0);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") flush();
        }}
        onBlur={(e) => {
          flush();
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
