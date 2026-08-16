import { apiRequest, dataOf } from '../../api';

export const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });

export function monthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString('en-CA');
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toLocaleDateString('en-CA');
  return { from, to };
}

export const asArray = (value) => Array.isArray(value) ? value : [];
export const money = (minor) => new Intl.NumberFormat('en-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(minor || 0) / 100);
export const dateTime = (value) => value ? new Intl.DateTimeFormat('en-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
export const statusLabel = (value) => String(value || 'unknown').replaceAll('_', ' ');
export const listFrom = (payload) => asArray(dataOf(payload, []));

export async function safeRequest(path) {
  try {
    return await apiRequest(path);
  } catch (error) {
    if (error.status === 403) return { forbidden: true };
    throw error;
  }
}
