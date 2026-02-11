# Compound Interest Calculator (Inflation-Adjusted)

Standalone static calculator that mirrors the concepts from `compound_interest_worksheet_monthly_equiv_inflation.xlsx`:

- Inputs: initial investment, monthly investment, years, 4 annual return rates, inflation rate
- Inflation-adjusted projection in today's dollars
- Year-by-year table + 4-line chart
- Summary metrics (total invested, final values, times increase, average yearly increase)

## Formula Notes

For each annual scenario rate `r` and inflation `i`:

- Real monthly rate: `((1 + r) / (1 + i))^(1/12) - 1`
- At each year `y`, months `n = y * 12`
- Future value (end-of-period contributions):
  - `FV = PV * (1 + rm)^n + PMT * (((1 + rm)^n - 1) / rm)` when `rm != 0`
  - `FV = PV + PMT * n` when `rm == 0`

This matches the worksheet intent for inflation-adjusted values in today's dollars.

## Local Run

No build step required.

1. Open `index.html` directly in a browser, or
2. Serve the folder with a local static server.

## Deploy To GitHub Pages

1. Create a new public GitHub repository.
2. Add these files at repository root:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `calculator.js`
   - `formatters.js`
3. Commit and push to `main` (or default branch).
4. In GitHub repo settings:
   - Go to **Pages**
   - Set source to **Deploy from a branch**
   - Branch: `main`, folder: `/ (root)`
5. Save and wait for deployment.
6. Published URL will be:
   - `https://<username>.github.io/<repo>/`

## Embed In WordPress (No Plugin)

Use a **Custom HTML** block and paste:

```html
<iframe
  src="https://<username>.github.io/<repo>/"
  width="100%"
  height="760"
  style="border:0;"
  loading="lazy"
  title="Compound interest calculator"
></iframe>
```

## Optional URL Prefill

The app reads query params and writes them back as you change inputs:

- `initial` (dollars)
- `monthly` (dollars)
- `years`
- `inflation` (percent value, e.g. `2`)
- `rate1`..`rate4` (percent values)

Example:

`https://<username>.github.io/<repo>/?initial=10000&monthly=500&years=25&inflation=2&rate1=4&rate2=6&rate3=8&rate4=10`

## Verification Checklist

- Default values produce sensible projections increasing by rate tier.
- Changing any input updates summary, chart, and table.
- Negative real-rate warning appears when inflation exceeds one or more annual rates.
- Embedding in WordPress iframe works on desktop and mobile.
