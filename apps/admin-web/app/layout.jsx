import '../src/styles.css';
import { TooltipProvider } from '@/components/ui/tooltip';

export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_ADMIN_WEB_URL || 'http://127.0.0.1:5176'),
  title: {
    default: 'TAKEIN Admin',
    template: '%s · TAKEIN Admin',
  },
  description: 'Administration workspace for the TAKEIN platform.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
