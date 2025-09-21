'use client';

import { OrgSignInForm } from '@/components/org-signin-form';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function LoginPageContent() {
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get('redirectUrl');

  return <OrgSignInForm redirectUrl={redirectUrl || undefined} />;
}

export default function Page() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LoginPageContent />
    </Suspense>
  );
}
