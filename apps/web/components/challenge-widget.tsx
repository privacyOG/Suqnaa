'use client';

import { useCallback, useEffect, useRef } from 'react';

interface ChallengeRenderOptions {
  sitekey: string;
  action: string;
  language: string;
  theme: 'auto';
  callback: (token: string) => void;
  'expired-callback': () => void;
  'error-callback': () => void;
}

interface ChallengeApi {
  render(container: HTMLElement, options: ChallengeRenderOptions): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: ChallengeApi;
  }
}

export interface ChallengeWidgetProps {
  siteKey: string;
  action: string;
  locale: string;
  resetKey: number;
  onToken(token: string): void;
  onExpired(): void;
  onError(): void;
}

export function ChallengeWidget({
  siteKey,
  action,
  locale,
  resetKey,
  onToken,
  onExpired,
  onError
}: ChallengeWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const callbacksRef = useRef({ onToken, onExpired, onError });
  callbacksRef.current = { onToken, onExpired, onError };

  const renderWidget = useCallback(() => {
    if (!containerRef.current || !window.turnstile || widgetIdRef.current) {
      return;
    }

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      action,
      language: locale === 'ar' ? 'ar' : 'en',
      theme: 'auto',
      callback: (token) => callbacksRef.current.onToken(token),
      'expired-callback': () => callbacksRef.current.onExpired(),
      'error-callback': () => callbacksRef.current.onError()
    });
  }, [action, locale, siteKey]);

  useEffect(() => {
    const interval = window.setInterval(renderWidget, 100);
    renderWidget();

    return () => {
      window.clearInterval(interval);
      const widgetId = widgetIdRef.current;
      if (widgetId && window.turnstile) {
        window.turnstile.remove(widgetId);
      }
      widgetIdRef.current = null;
    };
  }, [renderWidget]);

  useEffect(() => {
    const widgetId = widgetIdRef.current;
    if (resetKey > 0 && widgetId && window.turnstile) {
      window.turnstile.reset(widgetId);
    }
  }, [resetKey]);

  return <div className="turnstile-shell" ref={containerRef} />;
}
