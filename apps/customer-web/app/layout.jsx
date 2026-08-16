import 'maplibre-gl/dist/maplibre-gl.css';
import './globals.css';
import { CustomerSessionProvider } from '../src/components/CustomerSessionProvider.jsx';

export const metadata = {
    metadataBase: new URL(process.env.NEXT_PUBLIC_CUSTOMER_APP_URL || 'http://127.0.0.1:5174'),
    title: 'YouYaku - Book Local Salon & Beauty Services',
    description: 'Find and book the best beauty, wellness, and salon services near you instantly with YouYaku.',
    openGraph: {
        title: 'YouYaku - Book Beauty Services with Confidence',
        description: 'Discover salons, choose a professional, and manage every appointment in one place.',
        type: 'website',
        images: [{ url: '/youyaku-social-card.png', width: 1731, height: 909, alt: 'YouYaku salon professional welcoming a customer' }],
    },
    twitter: {
        card: 'summary_large_image',
        images: ['/youyaku-social-card.png'],
    },
};

export default function RootLayout({ children }) {
    return (
        <html lang="en" data-scroll-behavior="smooth">
            <head>
                <link
                    href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
                    rel="stylesheet"
                />
                <link
                    href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
                    rel="stylesheet"
                />
            </head>
            <body>
                <CustomerSessionProvider>{children}</CustomerSessionProvider>
            </body>
        </html>
    );
}
