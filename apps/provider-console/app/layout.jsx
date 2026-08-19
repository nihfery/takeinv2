import '../src/styles.css';
import { TooltipProvider } from '@/components/ui/tooltip';

const themeBootScript = `(function(){try{var saved=localStorage.getItem('takein-provider-theme');var dark=saved==='dark'||(!saved&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',dark)}catch(_){}})();`;

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
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeBootScript }} /></head>
      <body><TooltipProvider>{children}</TooltipProvider></body>
    </html>
  );
}
