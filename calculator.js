const DEFAULT_INPUTS = {
  initialInvestment: 5000,
  monthlyInvestment: 300,
  years: 30,
  inflationRate: 0.02,
  rates: [0.05, 0.1, 0.15, 0.2],
};

const MIN_YEARS = 1;
const MAX_YEARS = 60;

const EPSILON = 1e-12;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toFiniteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeInputs(raw) {
  const base = raw || {};
  const rates = Array.isArray(base.rates) ? base.rates : DEFAULT_INPUTS.rates;

  return {
    initialInvestment: Math.max(0, toFiniteNumber(base.initialInvestment, DEFAULT_INPUTS.initialInvestment)),
    monthlyInvestment: Math.max(0, toFiniteNumber(base.monthlyInvestment, DEFAULT_INPUTS.monthlyInvestment)),
    years: clamp(
      Math.round(toFiniteNumber(base.years, DEFAULT_INPUTS.years)),
      MIN_YEARS,
      MAX_YEARS
    ),
    inflationRate: toFiniteNumber(base.inflationRate, DEFAULT_INPUTS.inflationRate),
    rates: [0, 1, 2, 3].map((idx) => toFiniteNumber(rates[idx], DEFAULT_INPUTS.rates[idx])),
  };
}

function fvEndOfPeriod(ratePerPeriod, periods, paymentPerPeriod, presentValue) {
  if (Math.abs(ratePerPeriod) < EPSILON) {
    return presentValue + paymentPerPeriod * periods;
  }

  const growth = Math.pow(1 + ratePerPeriod, periods);
  return presentValue * growth + paymentPerPeriod * ((growth - 1) / ratePerPeriod);
}

function calculateRealMonthlyRate(annualRate, inflationRate) {
  return Math.pow((1 + annualRate) / (1 + inflationRate), 1 / 12) - 1;
}

function buildProjectionSeries(inputs) {
  const years = [];

  for (let year = 1; year <= inputs.years; year += 1) {
    const row = {
      year,
      values: [],
    };

    for (let i = 0; i < 4; i += 1) {
      const annualRate = inputs.rates[i];
      const realMonthlyRate = calculateRealMonthlyRate(annualRate, inputs.inflationRate);
      const value = fvEndOfPeriod(
        realMonthlyRate,
        year * 12,
        inputs.monthlyInvestment,
        inputs.initialInvestment
      );
      row.values.push(value);
    }

    years.push(row);
  }

  return years;
}

function calculateModel(rawInputs) {
  const inputs = normalizeInputs(rawInputs);
  const projections = buildProjectionSeries(inputs);
  const lastRow = projections[projections.length - 1];
  const totalInvestedToday = inputs.initialInvestment + (inputs.monthlyInvestment * 12 * inputs.years);

  const finalValues = lastRow ? [...lastRow.values] : [0, 0, 0, 0];
  const timesIncrease = finalValues.map((value) => (
    totalInvestedToday > 0 ? value / totalInvestedToday : null
  ));

  const maxFinalValue = Math.max(...finalValues);
  const averageYearlyIncrease = inputs.years > 0
    ? (maxFinalValue - totalInvestedToday) / inputs.years
    : 0;

  const warnings = [];
  const realMonthlyRates = inputs.rates.map((rate) => calculateRealMonthlyRate(rate, inputs.inflationRate));
  if (realMonthlyRates.some((rate) => rate < 0)) {
    warnings.push("One or more real monthly rates are negative (inflation exceeds annual return).");
  }

  return {
    inputs,
    warnings,
    totals: {
      totalInvestedToday,
      averageYearlyIncrease,
    },
    scenarios: inputs.rates.map((rate, index) => ({
      index,
      annualRate: rate,
      realMonthlyRate: realMonthlyRates[index],
      finalValue: finalValues[index],
      timesIncrease: timesIncrease[index],
    })),
    projections,
  };
}

export {
  DEFAULT_INPUTS,
  MIN_YEARS,
  MAX_YEARS,
  normalizeInputs,
  calculateRealMonthlyRate,
  calculateModel,
};
