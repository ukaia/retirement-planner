/**
 * Standard planning disclaimers. The footer variant is compact and shown app-wide;
 * the full variant is shown on Profile and at the end of the printed summary.
 */
export function DisclaimerFooter() {
  return (
    <footer className="border-t border-border bg-surface-2 px-5 py-4 text-[11px] text-subtle leading-relaxed">
      <p>
        For planning and educational purposes only. Not financial, tax, or legal advice.
        Projections are estimates based on the inputs and assumptions you provide and on
        historical tax rules current as of 2025–2026. Past performance is not a guarantee of
        future results. Actual outcomes will vary, often substantially. Consult a qualified
        financial planner, CPA, or attorney before making decisions based on these projections.
      </p>
    </footer>
  );
}

export function DisclaimerCard() {
  return (
    <div className="card border-border-strong bg-surface-2 text-[12px] text-muted leading-relaxed space-y-2">
      <p className="font-semibold text-fg text-sm">A few important caveats</p>
      <ul className="space-y-1.5 list-disc list-inside">
        <li>
          <strong className="text-fg">This is a projection, not a guarantee.</strong> Returns,
          inflation, healthcare costs, tax law, and Social Security can all change. Even
          well-built projections can be wrong by wide margins, especially at long horizons.
        </li>
        <li>
          <strong className="text-fg">Past performance does not guarantee future results.</strong>{" "}
          The tier returns shown (5.96% / 8.12% / 9.62% / 12.49%) are illustrative averages from
          historical asset-class behavior and are not a forecast.
        </li>
        <li>
          <strong className="text-fg">Tax math is approximated.</strong> Federal brackets,
          IRMAA, RMD tables, and state rules are hardcoded for 2025–2026. Some values are
          estimates pending final 2026 guidance (see <code>docs/CONSTANTS_TODO.md</code>). Edge
          cases — AMT, NIIT corner cases, multi-state moves, business income — are not modeled.
        </li>
        <li>
          <strong className="text-fg">Monte Carlo is a sketch of uncertainty.</strong> Returns
          are drawn from independent normal distributions per asset; real markets exhibit fat
          tails, correlations, and regime changes that simple normals miss.
        </li>
        <li>
          <strong className="text-fg">No professional advice.</strong> Nothing here constitutes
          financial, tax, investment, or legal advice. For decisions that affect your money,
          consult a fee-only financial planner (CFP), CPA, or attorney.
        </li>
        <li>
          <strong className="text-fg">Local-only.</strong> All inputs stay in your browser. The
          authors of this software make no representations about its accuracy and accept no
          liability for outcomes.
        </li>
      </ul>
    </div>
  );
}
