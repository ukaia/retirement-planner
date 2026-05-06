import * as Comlink from "comlink";
import { runMonteCarlo, type MonteCarloResult } from "@/lib/monte-carlo";
import type { Plan } from "@/state/schema";

const api = {
  run(args: { plan: Plan; simulations: number; seed?: number }): MonteCarloResult {
    return runMonteCarlo({
      plan: args.plan,
      simulations: args.simulations,
      seed: args.seed,
    });
  },
};

export type MonteCarloWorkerApi = typeof api;

Comlink.expose(api);
