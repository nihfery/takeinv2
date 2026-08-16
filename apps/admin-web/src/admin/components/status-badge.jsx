import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const positive = new Set(['active', 'verified', 'completed', 'paid', 'settlement', 'success']);
const warning = new Set(['pending', 'submitted', 'waiting', 'confirmed', 'processing']);
const negative = new Set(['inactive', 'rejected', 'cancelled', 'customer_cancelled', 'failed', 'expired']);

export function StatusBadge({ value }) {
  const normalized = String(value || 'unknown').toLowerCase();
  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1.5 rounded-full px-2.5 py-1 font-medium capitalize',
        positive.has(normalized) && 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300',
        warning.has(normalized) && 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300',
        negative.has(normalized) && 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300',
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {normalized.replaceAll('_', ' ')}
    </Badge>
  );
}
