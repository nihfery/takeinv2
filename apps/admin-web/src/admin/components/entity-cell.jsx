import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { initials } from '../formatters';

export function EntityCell({ title, subtitle }) {
  return (
    <div className="flex min-w-[190px] items-center gap-3">
      <Avatar className="size-9 rounded-lg">
        <AvatarFallback className="rounded-lg bg-primary/8 text-xs font-semibold text-primary">
          {initials(title)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="max-w-[220px] truncate font-medium text-foreground">{title || 'Untitled'}</div>
        {subtitle ? <div className="mt-0.5 max-w-[220px] truncate text-xs text-muted-foreground">{subtitle}</div> : null}
      </div>
    </div>
  );
}
