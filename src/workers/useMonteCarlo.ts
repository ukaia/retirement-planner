import { useEffect, useRef, useState } from "react";
import * as Comlink from "comlink";
import type { Plan } from "@/state/schema";
import type { MonteCarloResult } from "@/lib/monte-carlo";
import type { MonteCarloWorkerApi } from "./monte-carlo.worker";

type State = {
  result: MonteCarloResult | null;
  running: boolean;
  error: string | null;
};

export function useMonteCarlo(plan: Plan, simulations: number, debounceMs = 500) {
  const [state, setState] = useState<State>({ result: null, running: false, error: null });
  const workerRef = useRef<Worker | null>(null);
  const apiRef = useRef<Comlink.Remote<MonteCarloWorkerApi> | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL("./monte-carlo.worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;
    apiRef.current = Comlink.wrap<MonteCarloWorkerApi>(worker);
    return () => {
      worker.terminate();
      workerRef.current = null;
      apiRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = window.setTimeout(async () => {
      const api = apiRef.current;
      if (!api) return;
      setState((s) => ({ ...s, running: true, error: null }));
      try {
        const result = await api.run({ plan, simulations });
        setState({ result, running: false, error: null });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Monte Carlo failed";
        setState({ result: null, running: false, error: message });
      }
    }, debounceMs);
    return () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    };
  }, [plan, simulations, debounceMs]);

  return state;
}
