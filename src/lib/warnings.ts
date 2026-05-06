import type { Plan } from "../state/schema";
import { RETIREMENT_LIMITS, SECTION_121_EXCLUSION } from "./tax-constants";
import type { ProjectionRow } from "./projection";
import { isNearIrmaaCliff } from "./irmaa";

export type Warning = {
  level: "info" | "warn";
  text: string;
};

/**
 * Surface contribution-limit overages, SECURE 2.0 Roth catch-up triggers, and Section 121 hints.
 * Returns a list — empty if none apply.
 */
export function planWarnings(plan: Plan): Warning[] {
  const out: Warning[] = [];
  const limits = RETIREMENT_LIMITS[plan.profile.taxYear];

  // 401(k) over-contribution check.
  for (const a of plan.assets) {
    if (a.category === "trad-401k" || a.category === "roth-401k") {
      const ownerSalary =
        a.owner === "p2" ? plan.profile.person2?.currentSalary ?? 0 : plan.profile.person1.currentSalary;
      const annualEmployee = ownerSalary * (a.contributionPct ?? 0);
      if (annualEmployee > limits.k401) {
        out.push({
          level: "warn",
          text: `${a.nickname ?? "401(k)"} employee contribution ($${Math.round(annualEmployee).toLocaleString()}) exceeds ${plan.profile.taxYear} 401(k) limit ($${limits.k401.toLocaleString()}).`,
        });
      }
    }
    if (a.category === "trad-ira" || a.category === "roth-ira") {
      if ((a.annualContribution ?? 0) > limits.ira) {
        out.push({
          level: "warn",
          text: `${a.nickname ?? "IRA"} annual contribution ($${(a.annualContribution ?? 0).toLocaleString()}) exceeds ${plan.profile.taxYear} IRA limit ($${limits.ira.toLocaleString()}).`,
        });
      }
    }
    if (a.category === "hsa") {
      const hsaLimit =
        plan.profile.mode === "couple" ? limits.hsaFamily : limits.hsaSelf;
      if ((a.annualContribution ?? 0) > hsaLimit) {
        out.push({
          level: "warn",
          text: `${a.nickname ?? "HSA"} contribution ($${(a.annualContribution ?? 0).toLocaleString()}) exceeds ${plan.profile.taxYear} HSA limit ($${hsaLimit.toLocaleString()}).`,
        });
      }
    }
  }

  // SECURE 2.0 mandatory Roth catch-up note (prior-year SS wages above $150k).
  if (plan.profile.taxYear === 2026) {
    const threshold = limits.rothCatchupSsThreshold;
    if (threshold !== null && plan.profile.person1.currentSalary > threshold) {
      out.push({
        level: "info",
        text: `SECURE 2.0: Person 1 wages exceed $${threshold.toLocaleString()}, so any 50+ catch-up contributions must go to Roth in 2026.`,
      });
    }
    if (threshold !== null && (plan.profile.person2?.currentSalary ?? 0) > threshold) {
      out.push({
        level: "info",
        text: `SECURE 2.0: Person 2 wages exceed $${threshold.toLocaleString()}, so any 50+ catch-up contributions must go to Roth in 2026.`,
      });
    }
  }

  // Section 121 reminder if a primary residence is set to liquidate.
  for (const a of plan.assets) {
    if (a.category !== "real-estate" || a.subtype !== "primary") continue;
    if (a.actionAtRetirement !== "liquidate") continue;
    const exclusion = SECTION_121_EXCLUSION[plan.profile.filingStatus];
    out.push({
      level: "info",
      text: `Section 121 will exclude up to $${exclusion.toLocaleString()} of gain on the primary residence sale, given the 2-of-5-year ownership/use test is met.`,
    });
  }

  return out;
}

/**
 * IRMAA cliff warnings: scan post-65 projection years for MAGI within $5k of the next bracket.
 */
export function irmaaCliffWarnings(plan: Plan, rows: ProjectionRow[]): Warning[] {
  const out: Warning[] = [];
  for (const r of rows) {
    if (r.p1Age < 65) continue;
    const probe = isNearIrmaaCliff({
      magi: r.magi,
      year: r.year,
      filingStatus: plan.profile.filingStatus,
    });
    if (probe.near && probe.nextThreshold !== null) {
      out.push({
        level: "warn",
        text: `IRMAA cliff in ${r.year} (age ${r.p1Age}): MAGI is $${Math.round(probe.gap).toLocaleString()} below the next bracket at $${Math.round(probe.nextThreshold).toLocaleString()}.`,
      });
      // Don't flood — break after the first one.
      break;
    }
  }
  return out;
}
