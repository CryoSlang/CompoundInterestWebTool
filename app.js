import { DEFAULT_INPUTS, MAX_YEARS, MIN_YEARS, calculateModel, normalizeInputs } from "./calculator.js";
import {
  formatCompactCurrency,
  formatCurrency,
  formatInteger,
  formatPercent,
  formatRatio,
} from "./formatters.js";

const RATE_COLORS = ["#2366d1", "#0f8b5f", "#8a4df1", "#d46e1b"];
const APP_VERSION = "v1.2.0";

const dom = {
  form: document.getElementById("calculator-form"),
  resetButton: document.getElementById("reset-button"),
  summaryGrid: document.getElementById("summary-grid"),
  warning: document.getElementById("validation-message"),
  tableBody: document.getElementById("projection-table-body"),
  chartWrapper: document.getElementById("chart-wrapper"),
  chartLegend: document.getElementById("chart-legend"),
  tableCompactControls: document.getElementById("table-compact-controls"),
  projectionTable: document.getElementById("projection-table"),
  appVersion: document.getElementById("app-version"),
  projectionTitle: document.getElementById("projection-title"),
  chartSubtitle: document.getElementById("chart-subtitle"),
  actionMessage: document.getElementById("action-message"),
  viewModeToggle: document.getElementById("view-mode-toggle"),
  modeRealLabel: document.getElementById("mode-real-label"),
  modeNominalLabel: document.getElementById("mode-nominal-label"),
  copyShareButton: document.getElementById("copy-share-link"),
  downloadCsvButton: document.getElementById("download-csv"),
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

let mobileScenarioIndex = 0;
let viewMode = "real";
let currentModel = null;

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

  const parsedView = params.get("view");
  if (parsedView === "nominal" || parsedView === "real") {
    viewMode = parsedView;
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
  params.set("view", viewMode);
  inputs.rates.forEach((rate, index) => params.set(`rate${index + 1}`, String(rate * 100)));
  const next = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, "", next);
}

function buildMetricCard(title, value, subtext, className = "") {
  const article = document.createElement("article");
  article.className = `metric-card ${className}`.trim();

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
  const topSection = document.createElement("section");
  topSection.className = "summary-section";
  const topGrid = document.createElement("div");
  topGrid.className = "summary-grid";

  const totalInvestedCard = buildMetricCard(
    "Total Invested (today's $)",
    formatCurrency(model.totals.totalInvestedToday),
    `${formatInteger(model.inputs.years)} years`,
    viewMode === "real" ? "metric-card--primary" : ""
  );
  topGrid.append(totalInvestedCard);

  topGrid.append(
    buildMetricCard(
      "Total Invested (actual $)",
      formatCurrency(model.totals.totalInvestedActual),
      "Nominal contributions inflated over time",
      viewMode === "nominal" ? "metric-card--primary" : ""
    )
  );

  const avgYearly = viewMode === "real"
    ? model.totals.averageYearlyIncreaseReal
    : model.totals.averageYearlyIncreaseNominal;
  topGrid.append(
    buildMetricCard(
      "Average Yearly Increase",
      formatCurrency(avgYearly),
      "Based on highest-rate scenario (worksheet method)"
    )
  );
  topSection.append(topGrid);

  const resultsSection = document.createElement("section");
  resultsSection.className = "summary-section summary-results-group";
  const sectionTitle = document.createElement("p");
  sectionTitle.className = "summary-section-title";
  sectionTitle.textContent = "Results by Scenario";
  resultsSection.append(sectionTitle);
  const resultsGrid = document.createElement("div");
  resultsGrid.className = "results-grid";

  model.scenarios.forEach((scenario, index) => {
    const title = `Result at ${formatPercent(scenario.annualRate)}`;
    const value = viewMode === "real"
      ? formatCurrency(scenario.finalValueReal)
      : formatCurrency(scenario.finalValueNominal);
    const increase = viewMode === "real" ? scenario.timesIncreaseReal : scenario.timesIncreaseNominal;
    const sub = `Times increase: ${formatRatio(increase)} | Real monthly rate: ${formatPercent(scenario.realMonthlyRate)}`;
    resultsGrid.append(buildMetricCard(title, value, sub));

    dom.rateHeaders[index].textContent = `Rate ${index + 1} (${formatPercent(scenario.annualRate)})`;
  });
  resultsSection.append(resultsGrid);

  dom.summaryGrid.append(topSection, resultsSection);
}

function renderTable(model) {
  const milestones = [100000, 500000, 1000000];
  const firstHitsByScenario = [new Map(), new Map(), new Map(), new Map()];
  const seriesKey = viewMode === "real" ? "realValues" : "nominalValues";

  model.projections.forEach((row, rowIndex) => {
    row[seriesKey].forEach((value, scenarioIndex) => {
      milestones.forEach((target) => {
        const existing = firstHitsByScenario[scenarioIndex].get(target);
        if (existing === undefined && value >= target) {
          firstHitsByScenario[scenarioIndex].set(target, rowIndex);
        }
      });
    });
  });

  const frag = document.createDocumentFragment();
  model.projections.forEach((row, rowIndex) => {
    const tr = document.createElement("tr");

    const yearTd = document.createElement("td");
    yearTd.textContent = formatInteger(row.year);
    tr.append(yearTd);

    const values = viewMode === "real" ? row.realValues : row.nominalValues;
    values.forEach((value, scenarioIndex) => {
      const td = document.createElement("td");
      td.textContent = formatCurrency(value);
      const crossedMilestones = milestones.filter(
        (target) => firstHitsByScenario[scenarioIndex].get(target) === rowIndex
      );
      if (crossedMilestones.length > 0) {
        td.classList.add("milestone-hit");
        td.title = `First crossed: ${crossedMilestones.map((m) => formatCurrency(m)).join(", ")}`;
      }
      tr.append(td);
    });

    frag.append(tr);
  });

  dom.tableBody.innerHTML = "";
  dom.tableBody.append(frag);
}

function renderMobileTableControls(model) {
  dom.tableCompactControls.innerHTML = "";
  model.scenarios.forEach((scenario, idx) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `compact-scenario-button${idx === mobileScenarioIndex ? " is-active" : ""}`;
    button.textContent = `${idx + 1}: ${formatPercent(scenario.annualRate)}`;
    button.setAttribute("aria-pressed", idx === mobileScenarioIndex ? "true" : "false");
    button.addEventListener("click", () => {
      mobileScenarioIndex = idx;
      dom.projectionTable.setAttribute("data-mobile-scenario", String(idx));
      renderMobileTableControls(model);
    });
    dom.tableCompactControls.append(button);
  });

  dom.projectionTable.setAttribute("data-mobile-scenario", String(mobileScenarioIndex));
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
  const maxY = Math.max(
    ...rows.flatMap((row) => (viewMode === "real" ? row.realValues : row.nominalValues)),
    1
  );
  const xMax = Math.max(rows.length - 1, 1);

  const toX = (index) => margin.left + ((index / xMax) * plotWidth);
  const toY = (value) => margin.top + (plotHeight - ((value / maxY) * plotHeight));

  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("class", "chart-svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  const ariaLabel = viewMode === "real"
    ? "Line chart of inflation-adjusted value by year across four annual rates."
    : "Line chart of nominal value by year across four annual rates.";
  svg.setAttribute("aria-label", ariaLabel);

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
      y: toY((viewMode === "real" ? row.realValues : row.nominalValues)[scenarioIndex]),
      year: row.year,
      value: (viewMode === "real" ? row.realValues : row.nominalValues)[scenarioIndex],
    }));

    const path = document.createElementNS(svgNs, "path");
    path.setAttribute("d", buildLinePath(points));
    path.setAttribute("class", "series-line");
    path.setAttribute("stroke", RATE_COLORS[scenarioIndex]);
    svg.append(path);

    const finalPoint = points[points.length - 1];
    if (finalPoint) {
      const dot = document.createElementNS(svgNs, "circle");
      dot.setAttribute("cx", String(finalPoint.x));
      dot.setAttribute("cy", String(finalPoint.y));
      dot.setAttribute("r", "4");
      dot.setAttribute("class", "series-point");
      dot.setAttribute("fill", RATE_COLORS[scenarioIndex]);

      const title = document.createElementNS(svgNs, "title");
      title.textContent = `${formatPercent(scenario.annualRate)} - Year ${finalPoint.year}: ${formatCurrency(finalPoint.value)}`;
      dot.append(title);

      svg.append(dot);
    }
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
    const finalValue = viewMode === "real" ? scenario.finalValueReal : scenario.finalValueNominal;
    text.textContent = `${formatPercent(scenario.annualRate)} | Final ${formatCurrency(finalValue)}`;

    li.append(swatch, text);
    dom.chartLegend.append(li);
  });
}

function renderViewModeUi() {
  const isReal = viewMode === "real";
  dom.viewModeToggle.classList.toggle("is-nominal", !isReal);
  dom.viewModeToggle.setAttribute("aria-checked", String(!isReal));
  dom.modeRealLabel.classList.toggle("is-active", isReal);
  dom.modeNominalLabel.classList.toggle("is-active", !isReal);
  dom.projectionTitle.textContent = isReal
    ? "Projection (Today’s Dollars)"
    : "Projection (Nominal Dollars)";
  dom.chartSubtitle.textContent = isReal
    ? "Year-by-year inflation-adjusted value across 4 scenarios."
    : "Year-by-year nominal value across 4 scenarios.";
}

function escapeCsvValue(value) {
  const raw = String(value ?? "");
  if (raw.includes(",") || raw.includes("\"") || raw.includes("\n")) {
    return `"${raw.replaceAll("\"", "\"\"")}"`;
  }
  return raw;
}

function buildCsv(model) {
  const rows = [];
  rows.push(["Mode", viewMode === "real" ? "Real (today's $)" : "Nominal (actual $)"]);
  rows.push(["Initial Investment", model.inputs.initialInvestment]);
  rows.push(["Monthly Investment", model.inputs.monthlyInvestment]);
  rows.push(["Years", model.inputs.years]);
  rows.push(["Inflation Rate", model.inputs.inflationRate]);
  rows.push(["Total Invested (today's $)", model.totals.totalInvestedToday]);
  rows.push(["Total Invested (actual $)", model.totals.totalInvestedActual]);
  rows.push([]);
  rows.push([
    "Year",
    ...model.scenarios.map((scenario) => `Rate ${formatPercent(scenario.annualRate)}`),
  ]);
  model.projections.forEach((row) => {
    const values = viewMode === "real" ? row.realValues : row.nominalValues;
    rows.push([row.year, ...values.map((value) => Number(value.toFixed(2)))]);
  });

  return rows.map((row) => row.map(escapeCsvValue).join(",")).join("\n");
}

function downloadCsv() {
  if (!currentModel) {
    return;
  }
  const csv = buildCsv(currentModel);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const suffix = viewMode === "real" ? "real" : "nominal";
  link.href = URL.createObjectURL(blob);
  link.download = `compound-interest-${suffix}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
  dom.actionMessage.textContent = "CSV download started.";
}

async function copyShareLink() {
  try {
    await navigator.clipboard.writeText(window.location.href);
    dom.actionMessage.textContent = "Share link copied to clipboard.";
  } catch (_err) {
    dom.actionMessage.textContent = "Clipboard copy failed. Copy the URL from your browser address bar.";
  }
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
  currentModel = model;
  renderViewModeUi();
  renderSummary(model);
  renderTable(model);
  renderMobileTableControls(model);
  renderChart(model);
  showWarnings(model);
  updateUrl(model.inputs);
}

const debouncedRender = debounce(renderAll, 150);

function bindEvents() {
  dom.form.addEventListener("input", debouncedRender);
  dom.viewModeToggle.addEventListener("click", () => {
    viewMode = viewMode === "real" ? "nominal" : "real";
    renderAll();
  });
  dom.copyShareButton.addEventListener("click", copyShareLink);
  dom.downloadCsvButton.addEventListener("click", downloadCsv);
  dom.resetButton.addEventListener("click", () => {
    populateForm(DEFAULT_INPUTS);
    renderAll();
  });
}

function boot() {
  const fromUrl = parseUrlState();
  const initial = normalizeInputs(fromUrl || DEFAULT_INPUTS);
  populateForm(initial);
  dom.appVersion.textContent = `Version ${APP_VERSION}`;
  bindEvents();
  renderAll();
}

boot();
