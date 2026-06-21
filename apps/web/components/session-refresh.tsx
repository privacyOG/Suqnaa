'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

interface NavigatorWithLocks extends Navigator {
  locks?: {
    request<T>(name: string, callback: () => Promise<T>): Promise<T>;
  };
}

interface WindowWithRefreshPromise extends Window {
  __suqnaaSessionRefresh?: Promise<Response>;
}

export interface SessionRefreshProps {
  locale: string;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function refreshRequest(): Promise<Response> {
  const target = window as WindowWithRefreshPromise;

  if (!target.__suqnaaSessionRefresh) {
    target.__suqnaaSessionRefresh = fetch('/api/session/refresh', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store'
    }).finally(() => {
      delete target.__suqnaaSessionRefresh;
    });
  }

  return target.__suqnaaSessionRefresh;
}

async function rotateWithBrowserLock(): Promise<Response> {
  const lockManager = (navigator as NavigatorWithLocks).locks;
  if (!lockManager) {
    return refreshRequest();
  }

  return lockManager.request('suqnaa-session-refresh', refreshRequest);
}

export function SessionRefresh({ locale }: SessionRefreshProps) {
  const router = useRouter();
  const isArabic = locale === 'ar';
  const startedRef = useRef(false);
  const [status, setStatus] = useState<'refreshing' | 'error' | 'throttled'>('refreshing');
  const [retryAfter, setRetryAfter] = useState<number | null>(null);

  async function restoreSession() {
    setStatus('refreshing');
    setRetryAfter(null);

    let response: Response;
    try {
      response = await rotateWithBrowserLock();

      if (response.status === 401) {
        await delay(150);
        response = await rotateWithBrowserLock();
      }
    } catch {
      setStatus('error');
      return;
    }

    if (response.ok) {
      router.refresh();
      return;
    }

    if (response.status === 401) {
      await fetch('/api/session', {
        method: 'DELETE',
        credentials: 'same-origin',
        cache: 'no-store'
      }).catch(() => undefined);
      router.refresh();
      return;
    }

    if (response.status === 429) {
      const parsed = Number.parseInt(response.headers.get('retry-after') ?? '', 10);
      setRetryAfter(Number.isFinite(parsed) && parsed > 0 ? parsed : null);
      setStatus('throttled');
      return;
    }

    setStatus('error');
  }

  useEffect(() => {
    if (startedRef.current) {
      return;
    }

    startedRef.current = true;
    void restoreSession();
  }, []);

  return (
    <div className="session-refresh" aria-live="polite">
      {status === 'refreshing' ? (
        <p className="auth-status">
          {isArabic ? 'جارٍ استعادة الجلسة الآمنة…' : 'Restoring your secure session…'}
        </p>
      ) : null}

      {status === 'throttled' ? (
        <>
          <p className="auth-error">
            {isArabic
              ? `محاولات كثيرة. انتظر${retryAfter ? ` ${retryAfter} ثانية` : ''} ثم أعد المحاولة.`
              : `Too many refresh attempts. Wait${retryAfter ? ` ${retryAfter} seconds` : ''} and try again.`}
          </p>
          <button className="button-secondary" type="button" onClick={() => void restoreSession()}>
            {isArabic ? 'إعادة المحاولة' : 'Try again'}
          </button>
        </>
      ) : null}

      {status === 'error' ? (
        <>
          <p className="auth-error">
            {isArabic
              ? 'تعذر الوصول إلى خدمة الجلسة حالياً.'
              : 'The session service is temporarily unavailable.'}
          </p>
          <button className="button-secondary" type="button" onClick={() => void restoreSession()}>
            {isArabic ? 'إعادة المحاولة' : 'Try again'}
          </button>
        </>
      ) : null}
    </div>
  );
}
