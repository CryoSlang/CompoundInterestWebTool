const DEFAULT_INPUTS = {
  initialInvestment: 5000,
  monthlyInvestment: 300,
  years: 30,
  contributionYears: null,
  startWithdrawalYear: null,
  monthlyWithdrawal: 0,
  inflationRate: 0.02,
  enabledRates: [true, true, true, true],
  rates: [0.05, 0.1, 0.15, 0.2],
};

const MIN_YEARS = 1;
const MAX_YEARS = 60;

const EPSILON = 1e-12;

function roundCurrency(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

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
  const enabledRates = normalizeEnabledRates(base.enabledRates);
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
    startWithdrawalYear: normalizeStartWithdrawalYear(base.startWithdrawalYear, years),
    monthlyWithdrawal: Math.max(0, toFiniteNumber(base.monthlyWithdrawal, DEFAULT_INPUTS.monthlyWithdrawal)),
    inflationRate: toFiniteNumber(base.inflationRate, DEFAULT_INPUTS.inflationRate),
    enabledRates,
    rates: [0, 1, 2, 3].map((idx) => toFiniteNumber(rates[idx], DEFAULT_INPUTS.rates[idx])),
  };
}

function normalizeEnabledRates(rawEnabledRates) {
  const source = Array.isArray(rawEnabledRates) ? rawEnabledRates : DEFAULT_INPUTS.enabledRates;
  const normalized = [0, 1, 2, 3].map((idx) => Boolean(source[idx]));
  if (!normalized.some(Boolean)) {
    normalized[0] = true;
  }
  return normalized;
}

function normalizeContributionYears(rawContributionYears, years) {
  if (rawContributionYears === null || rawContributionYears === undefined || rawContributionYears === "") {
    return null;
  }
  return clamp(
    Math.round(toFiniteNumber(rawContributionYears, years)),
    0,
    years
  );
}

function normalizeStartWithdrawalYear(rawStartYear, years) {
  if (rawStartYear === null || rawStartYear === undefined || rawStartYear === "") {
    return null;
  }
  return clamp(
    Math.round(toFiniteNumber(rawStartYear, 1)),
    1,
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
  const months = (inputs.contributionYears ?? inputs.years) * 12;
  const inflationMonthlyRate = calculateInflationMonthlyRate(inputs.inflationRate);
  const monthlyTotal = Math.abs(inflationMonthlyRate) < EPSILON
    ? inputs.monthlyInvestment * months
    : inputs.monthlyInvestment * ((Math.pow(1 + inflationMonthlyRate, months) - 1) / inflationMonthlyRate);
  return inputs.initialInvestment + monthlyTotal;
}

function simulateScenario(inputs, annualRate) {
  const monthlyRealRate = calculateRealMonthlyRate(annualRate, inputs.inflationRate);
  const monthlyInflationRate = calculateInflationMonthlyRate(inputs.inflationRate);
  const totalMonths = inputs.years * 12;
  const contributionMonths = (inputs.contributionYears ?? inputs.years) * 12;
  const withdrawalStartMonth = inputs.startWithdrawalYear
    ? ((inputs.startWithdrawalYear - 1) * 12) + 1
    : null;

  let realBalance = inputs.initialInvestment;
  let cumulativeWithdrawnReal = 0;
  let cumulativeWithdrawnNominal = 0;
  let depletionYear = null;

  const yearlyRows = [];

  for (let month = 1; month <= totalMonths; month += 1) {
    if (realBalance < EPSILON) {
      realBalance = 0;
    }

    const canWithdraw = withdrawalStartMonth !== null
      && month >= withdrawalStartMonth
      && inputs.monthlyWithdrawal > 0;

    if (canWithdraw) {
      const requestedWithdrawal = inputs.monthlyWithdrawal;
      const actualWithdrawal = roundCurrency(Math.min(requestedWithdrawal, Math.max(realBalance, 0)));
      realBalance = roundCurrency(realBalance - actualWithdrawal);
      cumulativeWithdrawnReal = roundCurrency(cumulativeWithdrawnReal + actualWithdrawal);
      const nominalMonthFactor = Math.pow(1 + monthlyInflationRate, month);
      cumulativeWithdrawnNominal = roundCurrency(
        cumulativeWithdrawnNominal + (actualWithdrawal * nominalMonthFactor)
      );

      // If full requested withdrawal cannot be met, portfolio is effectively depleted.
      if (actualWithdrawal + EPSILON < requestedWithdrawal && depletionYear === null) {
        depletionYear = Math.ceil(month / 12);
      }
    }

    realBalance = roundCurrency(realBalance * (1 + monthlyRealRate));

    const canContribute = month <= contributionMonths;
    if (canContribute) {
      realBalance = roundCurrency(realBalance + inputs.monthlyInvestment);
    }

    if (realBalance < EPSILON) {
      realBalance = 0;
    }

    if (month % 12 === 0) {
      const year = month / 12;
      const inflationFactor = Math.pow(1 + inputs.inflationRate, year);
      yearlyRows.push({
        year,
        realValue: realBalance,
        nominalValue: realBalance * inflationFactor,
        cumulativeWithdrawnReal,
        cumulativeWithdrawnNominal,
      });
    }
  }

  return {
    monthlyRealRate,
    yearlyRows,
    depletionYear,
    totalWithdrawnReal: cumulativeWithdrawnReal,
    totalWithdrawnNominal: cumulativeWithdrawnNominal,
  };
}

function buildProjectionSeries(inputs, scenarioRuns) {
  const years = [];
  for (let i = 0; i < inputs.years; i += 1) {
    years.push({
      year: i + 1,
      realValues: scenarioRuns.map((run) => run.yearlyRows[i].realValue),
      nominalValues: scenarioRuns.map((run) => run.yearlyRows[i].nominalValue),
      cumulativeWithdrawnReal: Math.max(...scenarioRuns.map((run) => run.yearlyRows[i].cumulativeWithdrawnReal)),
      cumulativeWithdrawnNominal: Math.max(...scenarioRuns.map((run) => run.yearlyRows[i].cumulativeWithdrawnNominal)),
    });
  }
  return years;
}

function calculateModel(rawInputs) {
  const inputs = normalizeInputs(rawInputs);
  const scenarioRuns = inputs.rates.map((rate) => simulateScenario(inputs, rate));
  const projections = buildProjectionSeries(inputs, scenarioRuns);
  const lastRow = projections[projections.length - 1];
  const contributionYears = inputs.contributionYears ?? inputs.years;
  const totalInvestedToday = inputs.initialInvestment + (inputs.monthlyInvestment * 12 * contributionYears);
  const totalInvestedActual = calculateTotalInvestedActual(inputs);

  const finalValuesReal = lastRow ? [...lastRow.realValues] : [0, 0, 0, 0];
  const finalValuesNominal = lastRow ? [...lastRow.nominalValues] : [0, 0, 0, 0];
  const timesIncreaseReal = finalValuesReal.map((value) => (
    totalInvestedToday > 0 ? value / totalInvestedToday : null
  ));
  const timesIncreaseNominal = finalValuesNominal.map((value) => (
    totalInvestedActual > 0 ? value / totalInvestedActual : null
  ));

  const enabledIndices = inputs.enabledRates
    .map((isEnabled, index) => (isEnabled ? index : -1))
    .filter((index) => index >= 0);
  const maxFinalValueReal = Math.max(...enabledIndices.map((i) => finalValuesReal[i]));
  const maxFinalValueNominal = Math.max(...enabledIndices.map((i) => finalValuesNominal[i]));
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

  const depletionYear = scenarioRuns.reduce((minYear, run) => {
    if (run.depletionYear === null) {
      return minYear;
    }
    if (minYear === null || run.depletionYear < minYear) {
      return run.depletionYear;
    }
    return minYear;
  }, null);

  const totalWithdrawnReal = Math.max(...scenarioRuns.map((run) => run.totalWithdrawnReal));
  const totalWithdrawnNominal = Math.max(...scenarioRuns.map((run) => run.totalWithdrawnNominal));

  return {
    inputs,
    warnings,
    totals: {
      totalInvestedToday,
      totalInvestedActual,
      totalWithdrawnReal,
      totalWithdrawnNominal,
      averageYearlyIncreaseReal,
      averageYearlyIncreaseNominal,
    },
    withdrawal: {
      startYear: inputs.startWithdrawalYear,
      monthlyAmountReal: inputs.monthlyWithdrawal,
      depletionYear,
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
      depletionYear: scenarioRuns[index].depletionYear,
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
