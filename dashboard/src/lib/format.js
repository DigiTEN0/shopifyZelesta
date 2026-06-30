// Shared formatting helpers for the dashboard.

export function money(amount, currency = 'EUR', locale = 'en') {
  const n = Number(amount || 0);
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

export function percent(n, digits = 1) {
  const v = Number(n || 0);
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(digits)}%`;
}

export function shortDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

export function monthLabel(ym) {
  try {
    const [y, m] = ym.split('-');
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en', {
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return ym;
  }
}
