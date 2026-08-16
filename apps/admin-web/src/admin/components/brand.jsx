import Link from 'next/link';
import { cn } from '@/lib/utils';

export function TakeinBrand({ compact = false, inverted = false, className }) {
  return (
    <Link
      href="/admin/dashboard"
      className={cn('flex items-center gap-3 font-semibold tracking-tight', inverted ? 'text-white' : 'text-foreground', className)}
      aria-label="TAKEIN Admin home"
    >
      <span className={cn(
        'grid size-9 place-items-center rounded-xl text-sm font-bold shadow-sm',
        inverted ? 'bg-white text-neutral-950' : 'bg-primary text-primary-foreground',
      )}>
        T
      </span>
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="text-[15px] tracking-[0.12em]">TAKEIN</span>
          <span className={cn('mt-1 text-[10px] font-medium tracking-[0.08em]', inverted ? 'text-white/55' : 'text-muted-foreground')}>ADMIN</span>
        </span>
      )}
    </Link>
  );
}
