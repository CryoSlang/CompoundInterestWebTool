import { DEFAULT_INPUTS, MAX_YEARS, MIN_YEARS, calculateModel, normalizeInputs } from "./calculator.js";
import {
  formatCompactCurrency,
  formatCurrency,
  formatInteger,
  formatPercent,
  formatRatio,
} from "./formatters.js";

const RATE_COLORS = ["#2366d1", "#0f8b5f", "#8a4df1", "#d46e1b"];

const dom = {
  form: document.getElementById("calculator-form"),
  resetButton: document.getElementById("reset-button"),
  summaryGrid: document.getElementById("summary-grid"),
  warning: document.getElementById("validation-message"),
  tableBody: document.getElementById("projection-table-body"),
  chartWrapper: document.getElementById("chart-wrapper"),
  chartLegend: document.getElementById("chart-legend"),
  rateHeaders: [
    document.getElementById("rate1-header"),
    document.getElementById("rate2-header"),
    document.getElementById("rate3-header"),
    document.getElementById("rate4-header"),
  ],
  inputs: {
    initialInvestment: document.getElementById("initialInvestment"),
    monthlyInvestment: document.getElementById("monthlyInvestment"),
    years: document.getElementById("years"),
    inflationRate: document.getElementById("inflationRate"),
    rates: [
      document.getElementById("rate1"),
      document.getElementById("rate2"),
      document.getElementById("rate3"),
      document.getElementById("rate4"),
    ],
  },
};

function debounce(fn, waitMs) {
  let timeout = null;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), waitMs);
  };
}

function percentToInput(rate) {
  return (rate * 100).toFixed(2).replace(/\.00$/, "");
}

function populateForm(inputs) {
  dom.inputs.initialInvestment.value = String(inputs.initialInvestment);
  dom.inputs.monthlyInvestment.value = String(inputs.monthlyInvestment);
  dom.inputs.years.value = String(inputs.years);
  dom.inputs.inflationRate.value = percentToInput(inputs.inflationRate);
  inputs.rates.forEach((rate, index) => {
    dom.inputs.rates[index].value = percentToInput(rate);
  });
}

function readRawInputs() {
  return {
    initialInvestment: Number(dom.inputs.initialInvestment.value),
    monthlyInvestment: Number(dom.inputs.monthlyInvestment.value),
    years: Number(dom.inputs.years.value),
    inflationRate: Number(dom.inputs.inflationRate.value) / 100,
    rates: dom.inputs.rates.map((input) => Number(input.value) / 100),
  };
}

function parseUrlState() {
  const params = new URLSearchParams(window.location.search);
  if ([...params.keys()].length === 0) {
    return null;
  }

  return {
    initialInvestment: Number(params.get("initial") ?? DEFAULT_INPUTS.initialInvestment),
    monthlyInvestment: Number(params.get("monthly") ?? DEFAULT_INPUTS.monthlyInvestment),
    years: Number(params.get("years") ?? DEFAULT_INPUTS.years),
    inflationRate: Number(params.get("inflation") ?? (DEFAULT_INPUTS.inflationRate * 100)) / 100,
    rates: [1, 2, 3, 4].map((i) => Number(params.get(`rate${i}`) ?? (DEFAULT_INPUTS.rates[i - 1] * 100)) / 100),
  };
}

function updateUrl(inputs) {
  const params = new URLSearchParams();
  params.set("initial", String(inputs.initialInvestment));
  params.set("monthly", String(inputs.monthlyInvestment));
  params.set("years", String(inputs.years));
  params.set("inflation", String(inputs.inflationRate * 100));
  inputs.rates.forEach((rate, index) => params.set(`rate${index + 1}`, String(rate * 100)));
  const next = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, "", next);
}

function buildMetricCard(title, value, subtext) {
  const article = document.createElement("article");
  article.className = "metric-card";

  const h3 = document.createElement("p");
  h3.className = "metric-title";
  h3.textContent = title;

  const v = document.createElement("p");
  v.className = "metric-value";
  v.textContent = value;

  const s = document.createElement("p");
  s.className = "metric-sub";
  s.textContent = subtext;

  article.append(h3, v, s);
  return article;
}

function renderSummary(model) {
  dom.summaryGrid.innerHTML = "";
  dom.summaryGrid.append(
    buildMetricCard(
      "Total Invested (today's $)",
      formatCurrency(model.totals.totalInvestedToday),
      `${formatInteger(model.inputs.years)} years`
    )
  );

  model.scenarios.forEach((scenario, index) => {
    const title = `Result at ${formatPercent(scenario.annualRate)}`;
    const value = formatCurrency(scenario.finalValue);
    const sub = `Times increase: ${formatRatio(scenario.timesIncrease)} | Real monthly rate: ${formatPercent(scenario.realMonthlyRate)}`;
    dom.summaryGrid.append(buildMetricCard(title, value, sub));

    dom.rateHeaders[index].textContent = `Rate ${index + 1} (${formatPercent(scenario.annualRate)})`;
  });

  dom.summaryGrid.append(
    buildMetricCard(
      "Average Yearly Increase",
      formatCurrency(model.totals.averageYearlyIncrease),
      "Based on highest-rate scenario (worksheet method)"
    )
  );
}

function renderTable(model) {
  const frag = document.createDocumentFragment();
  model.projections.forEach((row) => {
    const tr = document.createElement("tr");

    const yearTd = document.createElement("td");
    yearTd.textContent = formatInteger(row.year);
    tr.append(yearTd);

    row.values.forEach((value) => {
      const td = document.createElement("td");
      td.textContent = formatCurrency(value);
      tr.append(td);
    });

    frag.append(tr);
  });

  dom.tableBody.innerHTML = "";
  dom.tableBody.append(frag);
}

function buildLinePath(points) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
}

function renderChart(model) {
  const width = 980;
  const height = 360;
  const margin = { top: 20, right: 24, bottom: 36, left: 84 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const rows = model.projections;
  const maxY = Math.max(...rows.flatMap((row) => row.values), 1);
  const xMax = Math.max(rows.length - 1, 1);

  const toX = (index) => margin.left + ((index / xMax) * plotWidth);
  const toY = (value) => margin.top + (plotHeight - ((value / maxY) * plotHeight));

  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("class", "chart-svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Line chart of inflation-adjusted value by year across four annual rates.");

  const yTicks = 5;
  for (let i = 0; i <= yTicks; i += 1) {
    const yVal = (maxY / yTicks) * i;
    const y = toY(yVal);
    const line = document.createElementNS(svgNs, "line");
    line.setAttribute("x1", String(margin.left));
    line.setAttribute("x2", String(width - margin.right));
    line.setAttribute("y1", String(y));
    line.setAttribute("y2", String(y));
    line.setAttribute("class", "grid-line");
    svg.append(line);

    const label = document.createElementNS(svgNs, "text");
    label.setAttribute("x", String(margin.left - 8));
    label.setAttribute("y", String(y + 4));
    label.setAttribute("text-anchor", "end");
    label.setAttribute("class", "axis-label");
    label.textContent = formatCompactCurrency(yVal);
    svg.append(label);
  }

  const xTicks = Math.min(6, rows.length);
  for (let i = 0; i < xTicks; i += 1) {
    const idx = Math.round((i / Math.max(xTicks - 1, 1)) * (rows.length - 1));
    const x = toX(idx);
    const label = document.createElementNS(svgNs, "text");
    label.setAttribute("x", String(x));
    label.setAttribute("y", String(height - 12));
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("class", "axis-label");
    label.textContent = String(rows[idx].year);
    svg.append(label);
  }

  model.scenarios.forEach((scenario, scenarioIndex) => {
    const points = rows.map((row, rowIndex) => ({
      x: toX(rowIndex),
      y: toY(row.values[scenarioIndex]),
      year: row.year,
      value: row.values[scenarioIndex],
    }));

    const path = document.createElementNS(svgNs, "path");
    path.setAttribute("d", buildLinePath(points));
    path.setAttribute("class", "series-line");
    path.setAttribute("stroke", RATE_COLORS[scenarioIndex]);
    svg.append(path);

    points.forEach((point) => {
      const dot = document.createElementNS(svgNs, "circle");
      dot.setAttribute("cx", String(point.x));
      dot.setAttribute("cy", String(point.y));
      dot.setAttribute("r", "3");
      dot.setAttribute("class", "series-point");
      dot.setAttribute("fill", RATE_COLORS[scenarioIndex]);
      dot.setAttribute("tabindex", "0");

      const title = document.createElementNS(svgNs, "title");
      title.textContent = `${formatPercent(scenario.annualRate)} - Year ${point.year}: ${formatCurrency(point.value)}`;
      dot.append(title);

      svg.append(dot);
    });
  });

  dom.chartWrapper.innerHTML = "";
  dom.chartWrapper.append(svg);

  dom.chartLegend.innerHTML = "";
  model.scenarios.forEach((scenario, idx) => {
    const li = document.createElement("li");
    li.className = "legend-item";

    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.backgroundColor = RATE_COLORS[idx];

    const text = document.createElement("span");
    text.textContent = `${formatPercent(scenario.annualRate)} | Final ${formatCurrency(scenario.finalValue)}`;

    li.append(swatch, text);
    dom.chartLegend.append(li);
  });
}

function showWarnings(model) {
  const warnings = [];
  if (model.inputs.years < MIN_YEARS || model.inputs.years > MAX_YEARS) {
    warnings.push(`Years are clamped to ${MIN_YEARS}-${MAX_YEARS}.`);
  }
  warnings.push(...model.warnings);
  dom.warning.textContent = warnings.join(" ");
}

function renderAll() {
  const raw = readRawInputs();
  const normalized = normalizeInputs(raw);
  const model = calculateModel(normalized);
  renderSummary(model);
  renderTable(model);
  renderChart(model);
  showWarnings(model);
  updateUrl(model.inputs);
}

const debouncedRender = debounce(renderAll, 150);

function bindEvents() {
  dom.form.addEventListener("input", debouncedRender);
  dom.resetButton.addEventListener("click", () => {
    populateForm(DEFAULT_INPUTS);
    renderAll();
  });
}

function boot() {
  const fromUrl = parseUrlState();
  const initial = normalizeInputs(fromUrl || DEFAULT_INPUTS);
  populateForm(initial);
  bindEvents();
  renderAll();
}

boot();
