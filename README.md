# Retirement Planner

A static, client-only retirement planning web app: multi-asset modeling, Monte Carlo simulation, year-by-year withdrawal sequencing, RMDs, IRMAA, Social Security claiming optimization, sequence-of-returns risk, estate planning, expense modeling, and multiple income streams. Single user or couple. OR / WA / AK / ID for state tax.

All calculations run in your browser. No data leaves your device. State persists to `localStorage`. Monte Carlo simulations run in a Web Worker so the UI stays responsive.

## Tech

- React 19 + TypeScript (strict)
- Vite 6
- Tailwind CSS with a CSS-variable token layer
- Recharts for charts
- Zustand (with `persist` middleware) for state
- Comlink for the Monte Carlo Web Worker
- Vitest for the calculation engine

## Local development

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # run engine tests
npm run build    # production build to dist/
```

## Deployment to GitHub Pages

A GitHub Actions workflow at `.github/workflows/deploy.yml` builds and publishes to the `gh-pages` environment whenever `main` is updated.

Steps to ship:

1. Create a new GitHub repository.
2. Push this repo:
   ```sh
   git remote add origin https://github.com/<user>/<repo>.git
   git push -u origin main
   ```
3. In the GitHub repo settings → **Pages**, set the source to **GitHub Actions**.
4. The first push triggers the workflow. Subsequent pushes auto-deploy.

The workflow sets `VITE_BASE=/<repo-name>/` automatically, so the app works at `https://<user>.github.io/<repo>/` out of the box. If you use a custom domain or a `<user>.github.io` repo, edit `vite.config.ts` (or set `VITE_BASE=/`).

## Project layout

```
src/
  components/   # AppShell, sections, charts, input atoms
  lib/          # pure-function calc engine + tests
  state/        # Zustand store, schema, defaults, selectors
  workers/      # Monte Carlo Web Worker
docs/
  CONSTANTS_TODO.md  # year-end constants to verify
.github/workflows/
  deploy.yml
```

The calc engine in `src/lib/` is fully isolated from React and depends only on the typed `Plan` shape from `src/state/schema.ts`. It is tested with Vitest (89+ unit tests). UI components subscribe to derived projection state via memoized selectors.

## Constants and accuracy

Tax tables, contribution limits, IRMAA brackets, FRA tables, and the IRS Uniform Lifetime Table are hardcoded in `src/lib/tax-constants.ts` with citations. A handful of 2026 figures (WA LTCG threshold, OR standard deduction, ID zero-rate threshold, ACA FPL) are still being verified — see `docs/CONSTANTS_TODO.md`. Each is flagged with a `// TODO(verify-2026)` comment in code.

## Disclaimer

For planning and educational purposes only. Not financial, tax, or legal advice. Projections are estimates based on the inputs and assumptions you provide and on historical tax rules current as of 2025–2026. Past performance is not a guarantee of future results. Actual outcomes will vary, often substantially. Consult a qualified financial planner, CPA, or attorney before making decisions based on these projections. The authors of this software make no representations about its accuracy and accept no liability for outcomes.
