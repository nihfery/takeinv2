import { redirect } from 'next/navigation';

export default function ProviderVerificationRedirect() {
  redirect(process.env.NEXT_PUBLIC_PROVIDER_VERIFICATION_URL || 'http://127.0.0.1:5175/provider/verification');
}

