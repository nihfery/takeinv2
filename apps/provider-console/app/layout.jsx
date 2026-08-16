import '../src/styles.css';
import { TooltipProvider } from '@/components/ui/tooltip';

export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_PROVIDER_CONSOLE_URL || 'http://127.0.0.1:5175'),
  title: {
    default: 'TAKEIN Provider',
    template: '%s · TAKEIN Provider',
  },
  description: 'Manage bookings, teams, services, customers, payments, and locations with TAKEIN.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body><TooltipProvider>{children}</TooltipProvider></body>
    </html>
  );
}
