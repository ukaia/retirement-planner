type Props = {
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  step?: number;
  ariaLabel?: string;
};

export function Slider({ value, onChange, min, max, step = 1, ariaLabel }: Props) {
  return (
    <input
      type="range"
      aria-label={ariaLabel}
      className="w-full accent-accent"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(parseFloat(e.target.value))}
    />
  );
}
