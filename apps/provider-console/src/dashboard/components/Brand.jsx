import Link from 'next/link';
import { Command } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Brand({ inverted = false, compact = false, className }) {
  return (
    <Link
      href="/provider/dashboard"
      className={cn('flex min-w-0 items-center gap-2.5 text-foreground', inverted && 'text-white', className)}
      aria-label="TAKEIN Provider home"
    >
      <span className={cn(
        'grid size-8 shrink-0 place-items-center rounded-lg border shadow-xs',
        inverted ? 'border-white/20 bg-white text-neutral-950' : 'border-foreground/10 bg-primary text-primary-foreground',
      )}>
        <Command className="size-4.5" strokeWidth={2.25} />
      </span>
      {!compact ? (
        <span className="min-w-0">
          <strong className="block truncate text-sm font-semibold tracking-[-0.02em]">TAKEIN Provider</strong>
          <span className={cn('block truncate text-[10px] text-muted-foreground', inverted && 'text-white/55')}>Business workspace</span>
        </span>
      ) : null}
    </Link>
  );
}
