export function statusOf(item) {
  if (typeof item?.active === 'boolean') return item.active ? 'active' : 'inactive';
  return String(item?.status || item?.document_status || item?.payment_status || 'unknown').toLowerCase();
}

export function money(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0) / 100);
}

export function dateTime(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? String(value)
    : parsed.toLocaleString('en-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

export function nameOf(item) {
  return item?.business_name
    || item?.display_name
    || item?.name
    || item?.title
    || item?.code
    || item?.booking_code
    || `#${item?.id || '—'}`;
}

export function initials(value) {
  const parts = String(value || 'A').trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'A';
}
