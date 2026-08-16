import Link from 'next/link';
import { cn } from '@/lib/utils';

export default function Brand({ inverted = false, className }) {
  return (
    <Link href="/provider/dashboard" className={cn('flex items-center gap-3 text-foreground', inverted && 'text-white', className)} aria-label="TAKEIN Provider home">
      <span className={cn('grid size-9 place-items-center rounded-xl text-sm font-bold shadow-sm', inverted ? 'bg-white text-neutral-950' : 'bg-primary text-primary-foreground')}>T</span>
      <span className="flex flex-col leading-none">
        <strong className="text-[15px] tracking-[0.12em]">TAKEIN</strong>
        <span className={cn('mt-1 text-[10px] font-medium tracking-[0.08em]', inverted ? 'text-white/55' : 'text-muted-foreground')}>PROVIDER</span>
      </span>
    </Link>
  );
}
