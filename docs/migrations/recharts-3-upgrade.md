# Recharts 2 → 3 upgrade — DONE

**Status:** completed in PR (recharts 3.8.1, ^3.8.1 pinned)
**Originally planned for:** Dependabot PR #30 (closed in favor of this dedicated migration)

## What was changed

### Dependencies
- `recharts` → `^3.8.1` in `package.json`.

### `src/components/ui/chart.tsx` (shadcn wrapper)
The shadcn 4.x chart-component registry still ships a v2-compatible template. `npx shadcn add chart` therefore *downgrades* recharts back to ^2 silently as part of its install — the regenerated wrapper alone doesn't get you to v3.

The right path was: install recharts 3 *after* regenerating, then patch the wrapper for v3's tighter types. Two small type changes:

| Before (v2 shape) | After (v3 shape) |
|---|---|
| `React.ComponentProps<typeof RechartsPrimitive.Tooltip>` | `Partial<RechartsPrimitive.TooltipContentProps<TooltipValueType, string>>` |
| `Pick<RechartsPrimitive.LegendProps, 'payload' \| 'verticalAlign'>` | `Pick<RechartsPrimitive.DefaultLegendContentProps, 'payload' \| 'verticalAlign'>` |

Plus two callsite cleanups inside the wrapper:
- `key={item.dataKey}` → `key={String(item.dataKey ?? index)}` (in v3 `dataKey` may be a function)
- `formatter(item.value, item.name, …)` → `formatter(item.value, String(item.name), …)` (in v3 `NameType = string | number`)

And one **hydration fix** unrelated to types: recharts v3's `ResponsiveContainer` doesn't SSR to real markup (needs window dimensions), while React 19 hoists `<style>` elements differently between SSR and client. Together that produced a hydration mismatch on every chart. The fix gates both `ChartStyle` and `ResponsiveContainer` behind a `useEffect`-set `mounted` flag so the server-rendered HTML matches the first client render:

```tsx
const [mounted, setMounted] = React.useState(false);
React.useEffect(() => setMounted(true), []);
// …
{mounted && (
  <>
    <ChartStyle id={chartId} config={config} />
    <ResponsiveContainer>{children}</ResponsiveContainer>
  </>
)}
```

### `src/components/page-detail/trends-chart.tsx`
One line: `formatter={(value: number) => activeConfig.formatter(value)}` → `formatter={(value) => activeConfig.formatter(Number(value))}`. v3's `Formatter<ValueType, NameType>` types `value` as `ValueType | undefined`, so we can't narrow at the param level — coerce inside the call instead.

### Consumers untouched
- `sparkline.tsx`
- `donations-radial-card.tsx`
- `avg-gift-bar-card.tsx`

All use `AreaChart`/`BarChart`/`RadialBarChart` and their primitives at the component level, which kept their public surface compatible with our usage.

### Cleanup
- Removed `recharts` from the major-version ignore list in `.github/dependabot.yml`.
- `src/components/ui/card.tsx` was incidentally rewritten by `shadcn add chart` (to the older `forwardRef`/double-quote style) — that side-effect was reverted via `git checkout`.

## Verification (all passed)

- [x] `npm run type-check` clean against installed `recharts@3.8.1`
- [x] `npm run lint` — 0 errors (pre-existing warnings unchanged)
- [x] `npm run build` succeeds; 34/34 static pages generated; page-detail bundle ~240 kB (unchanged)
- [x] Visual QA in browser on the "Imported Sustainers — 20XJ — PO" page (richest dataset of the 68):
  - Donations radial card renders the half-donut with the One-Time / Recurring breakdown
  - Performance Trends line chart renders with axis labels and gridlines
  - Revenue sparkline renders inside its card
- [x] No hydration errors or recharts warnings in the dev console after a clean dev-server start

## Notes for future work

- **Always verify the installed version after `npx shadcn add chart`.** Their registry pins recharts to v2; running the install will silently downgrade. Re-pin v3 with `npm install recharts@^3` afterwards.
- If `<style>` element hoisting becomes a problem in other React 19 + Next 15 components, the mount-gating pattern in `ChartContainer` is the reference fix.
- Recharts v3 introduced typed generics (`data` / `dataKey`) and new hooks (`useXAxisScale`, `useYAxisScale`, `useCartesianScale`, `getRelativeCoordinate`) — not used yet, but available if any future interactive chart needs to convert mouse coordinates to data values.
- The install-script change Dependabot flagged on the original PR #30 (`prepare` hook) is just `husky` setup in recharts' own repo; doesn't run in consumer projects.
