import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { groupForSection, itemForSection } from '../config/navigation';

export default function ContentArea({ selected, sidebarCollapsed = false, children }) {
  const item = itemForSection(selected);
  const group = groupForSection(selected);

  return (
    <main className={cn(
      'min-h-screen min-w-0 overflow-x-hidden bg-background pt-12 transition-[padding] duration-200 lg:pl-68',
      sidebarCollapsed && 'lg:pl-16',
    )}>
      <div className="mx-auto w-full max-w-screen-2xl p-4 md:p-6">
        {selected !== 'overview' ? (
          <header className="mb-5 border-b pb-5 md:mb-6">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>Provider</span>
              <ChevronRight className="size-3" />
              <span>{group.label}</span>
              <ChevronRight className="size-3" />
              <span className="font-medium text-foreground">{item.label}</span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">{item.label}</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{item.description}</p>
          </header>
        ) : null}
        {children}
      </div>
    </main>
  );
}
