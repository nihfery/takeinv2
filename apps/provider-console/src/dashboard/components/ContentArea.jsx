import { Badge } from '@/components/ui/badge';
import { itemForSection } from '../config/navigation';

export default function ContentArea({ selected, children }) {
  const item = itemForSection(selected);
  const overview = selected === 'overview';
  return (
    <main className="min-h-screen bg-muted/20 pt-16 lg:pl-72">
      <div className="w-full px-3 py-3 sm:px-4 sm:py-4 lg:px-5 lg:py-5">
        {!overview ? (
          <div className="mb-4 flex flex-col justify-between gap-3 border-b pb-4 sm:flex-row sm:items-end">
            <div>
              <div className="flex items-center gap-2"><Badge variant="secondary" className="h-5 rounded-md px-1.5 text-[9px]">TAKEIN PROVIDER</Badge><span className="text-[10px] text-muted-foreground">Go microservices</span></div>
              <h1 className="mt-2 text-xl font-semibold tracking-tight">{item.label}</h1>
              <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">{item.description}</p>
            </div>
          </div>
        ) : null}
        {children}
      </div>
    </main>
  );
}
