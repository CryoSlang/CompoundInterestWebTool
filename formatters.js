const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const compactCurrencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 2,
});

const ratioFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

function formatCurrency(value) {
  if (!Number.isFinite(value)) {
    return "--";
  }
  return currencyFormatter.format(value);
}

function formatCompactCurrency(value) {
  if (!Number.isFinite(value)) {
    return "--";
  }
  return compactCurrencyFormatter.format(value);
}

function formatPercent(value) {
  if (!Number.isFinite(value)) {
    return "--";
  }
  return percentFormatter.format(value);
}

function formatRatio(value) {
  if (!Number.isFinite(value)) {
    return "--";
  }
  return `${ratioFormatter.format(value)}x`;
}

function formatInteger(value) {
  if (!Number.isFinite(value)) {
    return "--";
  }
  return numberFormatter.format(value);
}

export {
  formatCurrency,
  formatCompactCurrency,
  formatPercent,
  formatRatio,
  formatInteger,
};
