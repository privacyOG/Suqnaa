'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface SignOutButtonProps {
  locale: string;
}

export function SignOutButton({ locale }: SignOutButtonProps) {
  const router = useRouter();
  const isArabic = locale === 'ar';
  const [submitting, setSubmitting] = useState(false);

  async function signOut() {
    if (submitting) {
      return;
    }

    setSubmitting(true);
    try {
      await fetch('/api/session', { method: 'DELETE' });
      router.replace(`/${locale}/account`);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <button
      className="button-secondary"
      type="button"
      onClick={signOut}
      disabled={submitting}
    >
      {submitting
        ? (isArabic ? 'جارٍ تسجيل الخروج…' : 'Signing out…')
        : (isArabic ? 'تسجيل الخروج' : 'Sign out')}
    </button>
  );
}
