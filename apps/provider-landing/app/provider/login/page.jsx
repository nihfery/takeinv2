import { redirect } from 'next/navigation';

export default function ProviderLoginRedirect() {
  redirect(process.env.NEXT_PUBLIC_PROVIDER_LOGIN_URL || 'http://127.0.0.1:5175/provider/login');
}

