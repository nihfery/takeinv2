import '../src/styles.css';

export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_PROVIDER_FRONTEND_URL || 'http://127.0.0.1:5173'),
  title: 'YouYaku Partners - Booking, Payments & Admin',
  description: 'Everything from bookings and payments to reminders and reports.',
  openGraph: {
    title: 'YouYaku Partners - Grow Your Beauty Business',
    description: 'Manage bookings, teams, payments, customers, and every location from one provider workspace.',
    type: 'website',
    images: [{ url: '/youyaku-social-card.png', width: 1731, height: 909, alt: 'YouYaku salon professional and scheduling workspace' }],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/youyaku-social-card.png'],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
