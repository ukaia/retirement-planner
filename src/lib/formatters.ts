const FRACTION = Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const WHOLE = Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const PERCENT = Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});
const PERCENT0 = Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const NUM = Intl.NumberFormat("en-US");

export function formatCurrency(amount: number, opts?: { whole?: boolean }): string {
  if (!isFinite(amount)) return "—";
  return (opts?.whole ?? Math.abs(amount) >= 100 ? WHOLE : FRACTION).format(amount);
}

export function formatCompact(amount: number): string {
  if (!isFinite(amount)) return "—";
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return `${(amount / 1_000_000).toFixed(2).replace(/\.00$/, "")}M`;
  if (abs >= 1_000) return `${(amount / 1_000).toFixed(0)}K`;
  return WHOLE.format(amount);
}

export function formatPercent(p: number, opts?: { whole?: boolean }): string {
  if (!isFinite(p)) return "—";
  return (opts?.whole ? PERCENT0 : PERCENT).format(p);
}

export function formatNumber(n: number): string {
  if (!isFinite(n)) return "—";
  return NUM.format(n);
}

export function formatAge(age: number): string {
  return `${Math.round(age)}`;
}
