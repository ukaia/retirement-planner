type Option<T extends string> = { value: T; label: string };

export function Select<T extends string>({
  value,
  onChange,
  options,
  disabled,
}: {
  value: T;
  onChange: (next: T) => void;
  options: Option<T>[];
  disabled?: boolean;
}) {
  return (
    <select
      className="input appearance-none pr-8 cursor-pointer bg-no-repeat bg-[length:14px_14px] bg-[position:calc(100%-12px)_center]"
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23737373' stroke-width='2'><polyline points='6 9 12 15 18 9'/></svg>\")",
      }}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
