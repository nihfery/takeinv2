import { DatabaseZap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { RowActionMenu } from './row-action-menu';

function EmptyState({ query }) {
  return (
    <div className="grid min-h-72 place-items-center px-6 py-12 text-center">
      <div>
        <span className="mx-auto mb-4 grid size-11 place-items-center rounded-xl bg-muted text-muted-foreground">
          <DatabaseZap className="size-5" />
        </span>
        <h3 className="font-medium">{query ? 'No matching records' : 'No records yet'}</h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {query ? 'Try a different search term.' : 'Records will appear after they are available from the connected service.'}
        </p>
      </div>
    </div>
  );
}

export function AdminDataTable({ title, description, columns, items, actions, busy, query }) {
  return (
    <Card className="overflow-hidden py-0 shadow-none">
      <CardHeader className="border-b py-5">
        <div>
          <div className="flex items-center gap-2">
            <CardTitle>{title}</CardTitle>
            <Badge variant="secondary" className="rounded-full">{items.length}</Badge>
          </div>
          <CardDescription className="mt-1">{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        {!items.length ? <EmptyState query={query} /> : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/35 hover:bg-muted/35">
                {columns.map((column) => (
                  <TableHead key={column.label} className={column.className}>{column.label}</TableHead>
                ))}
                {actions ? <TableHead className="w-14 text-right"><span className="sr-only">Actions</span></TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, index) => (
                <TableRow key={item.id || item.uuid || item.booking_code || index}>
                  {columns.map((column) => (
                    <TableCell key={column.label} className={column.cellClassName}>
                      {column.render ? column.render(item) : String(item[column.key] ?? '—')}
                    </TableCell>
                  ))}
                  {actions ? (
                    <TableCell className="text-right">
                      <RowActionMenu
                        label={item.name || item.business_name || item.booking_code || item.id}
                        actions={actions(item)}
                        disabled={Boolean(busy)}
                      />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
