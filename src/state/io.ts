import { planSchema, type Plan } from "./schema";

export function exportPlanJson(plan: Plan): string {
  return JSON.stringify(plan, null, 2);
}

export function downloadPlan(plan: Plan, filename = "retirement-plan.json"): void {
  const blob = new Blob([exportPlanJson(plan)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function parsePlanJson(text: string): { ok: true; plan: Plan } | { ok: false; error: string } {
  try {
    const data = JSON.parse(text);
    const result = planSchema.safeParse(data);
    if (!result.success) {
      return { ok: false, error: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
    }
    return { ok: true, plan: result.data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid JSON" };
  }
}
