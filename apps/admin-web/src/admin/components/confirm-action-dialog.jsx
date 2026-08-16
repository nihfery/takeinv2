'use client';

import { LoaderCircle, ShieldAlert } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export function ConfirmActionDialog({ action, busy, onClose, onConfirm }) {
  return (
    <AlertDialog open={Boolean(action)} onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className={action?.destructive ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}>
            <ShieldAlert />
          </AlertDialogMedia>
          <AlertDialogTitle>{action?.title || 'Confirm this action'}</AlertDialogTitle>
          <AlertDialogDescription>
            {action?.description || 'This change will be sent to the connected Go service.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={action?.destructive ? 'destructive' : 'default'}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? <LoaderCircle className="animate-spin" /> : null}
            {busy ? 'Applying…' : (action?.confirmLabel || 'Confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
