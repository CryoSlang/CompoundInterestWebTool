const DEFAULT_INPUTS = {
  initialInvestment: 5000,
  monthlyInvestment: 300,
  years: 30,
  contributionYears: 30,
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
  const years = clamp(
    Math.round(toFiniteNumber(base.years, DEFAULT_INPUTS.years)),
    MIN_YEARS,
    MAX_YEARS
  );

  return {
    initialInvestment: Math.max(0, toFiniteNumber(base.initialInvestment, DEFAULT_INPUTS.initialInvestment)),
    monthlyInvestment: Math.max(0, toFiniteNumber(base.monthlyInvestment, DEFAULT_INPUTS.monthlyInvestment)),
    years,
    contributionYears: normalizeContributionYears(base.contributionYears, years),
    inflationRate: toFiniteNumber(base.inflationRate, DEFAULT_INPUTS.inflationRate),
    rates: [0, 1, 2, 3].map((idx) => toFiniteNumber(rates[idx], DEFAULT_INPUTS.rates[idx])),
  };
}

function normalizeContributionYears(rawContributionYears, years) {
  return clamp(
    Math.round(toFiniteNumber(rawContributionYears, years)),
    0,
    years
  );
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

function calculateNominalMonthlyRate(annualRate) {
  return Math.pow(1 + annualRate, 1 / 12) - 1;
}

function calculateInflationMonthlyRate(inflationRate) {
  return Math.pow(1 + inflationRate, 1 / 12) - 1;
}

function calculateTotalInvestedActual(inputs) {
  const months = inputs.contributionYears * 12;
  const inflationMonthlyRate = calculateInflationMonthlyRate(inputs.inflationRate);
  const monthlyTotal = Math.abs(inflationMonthlyRate) < EPSILON
    ? inputs.monthlyInvestment * months
    : inputs.monthlyInvestment * ((Math.pow(1 + inflationMonthlyRate, months) - 1) / inflationMonthlyRate);
  return inputs.initialInvestment + monthlyTotal;
}

function fvWithContributionStop(ratePerPeriod, totalPeriods, contributionPeriods, paymentPerPeriod, presentValue) {
  const cappedContributionPeriods = Math.min(totalPeriods, contributionPeriods);

  if (Math.abs(ratePerPeriod) < EPSILON) {
    return presentValue + (paymentPerPeriod * cappedContributionPeriods);
  }

  if (totalPeriods <= cappedContributionPeriods) {
    return fvEndOfPeriod(ratePerPeriod, totalPeriods, paymentPerPeriod, presentValue);
  }

  const valueAtStop = fvEndOfPeriod(
    ratePerPeriod,
    cappedContributionPeriods,
    paymentPerPeriod,
    presentValue
  );
  const growthOnlyPeriods = totalPeriods - cappedContributionPeriods;
  return valueAtStop * Math.pow(1 + ratePerPeriod, growthOnlyPeriods);
}

function buildProjectionSeries(inputs) {
  const years = [];

  for (let year = 1; year <= inputs.years; year += 1) {
    const row = {
      year,
      realValues: [],
      nominalValues: [],
    };
    const inflationFactor = Math.pow(1 + inputs.inflationRate, year);

    for (let i = 0; i < 4; i += 1) {
      const annualRate = inputs.rates[i];
      const realMonthlyRate = calculateRealMonthlyRate(annualRate, inputs.inflationRate);
      const realValue = fvWithContributionStop(
        realMonthlyRate,
        year * 12,
        inputs.contributionYears * 12,
        inputs.monthlyInvestment,
        inputs.initialInvestment
      );
      row.realValues.push(realValue);
      row.nominalValues.push(realValue * inflationFactor);
    }

    years.push(row);
  }

  return years;
}

function calculateModel(rawInputs) {
  const inputs = normalizeInputs(rawInputs);
  const projections = buildProjectionSeries(inputs);
  const lastRow = projections[projections.length - 1];
  const totalInvestedToday = inputs.initialInvestment + (inputs.monthlyInvestment * 12 * inputs.contributionYears);
  const totalInvestedActual = calculateTotalInvestedActual(inputs);

  const finalValuesReal = lastRow ? [...lastRow.realValues] : [0, 0, 0, 0];
  const finalValuesNominal = lastRow ? [...lastRow.nominalValues] : [0, 0, 0, 0];
  const timesIncreaseReal = finalValuesReal.map((value) => (
    totalInvestedToday > 0 ? value / totalInvestedToday : null
  ));
  const timesIncreaseNominal = finalValuesNominal.map((value) => (
    totalInvestedActual > 0 ? value / totalInvestedActual : null
  ));

  const maxFinalValueReal = Math.max(...finalValuesReal);
  const maxFinalValueNominal = Math.max(...finalValuesNominal);
  const averageYearlyIncreaseReal = inputs.years > 0
    ? (maxFinalValueReal - totalInvestedToday) / inputs.years
    : 0;
  const averageYearlyIncreaseNominal = inputs.years > 0
    ? (maxFinalValueNominal - totalInvestedActual) / inputs.years
    : 0;

  const warnings = [];
  const realMonthlyRates = inputs.rates.map((rate) => calculateRealMonthlyRate(rate, inputs.inflationRate));
  const nominalMonthlyRates = inputs.rates.map((rate) => calculateNominalMonthlyRate(rate));
  if (realMonthlyRates.some((rate) => rate < 0)) {
    warnings.push("One or more real monthly rates are negative (inflation exceeds annual return).");
  }

  return {
    inputs,
    warnings,
    totals: {
      totalInvestedToday,
      totalInvestedActual,
      averageYearlyIncreaseReal,
      averageYearlyIncreaseNominal,
    },
    scenarios: inputs.rates.map((rate, index) => ({
      index,
      annualRate: rate,
      realMonthlyRate: realMonthlyRates[index],
      nominalMonthlyRate: nominalMonthlyRates[index],
      finalValueReal: finalValuesReal[index],
      finalValueNominal: finalValuesNominal[index],
      timesIncreaseReal: timesIncreaseReal[index],
      timesIncreaseNominal: timesIncreaseNominal[index],
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
