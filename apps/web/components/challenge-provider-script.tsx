'use client';

import Script from 'next/script';

const providerScriptUrl =
  process.env.NEXT_PUBLIC_CHALLENGE_SCRIPT_URL ??
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

export function ChallengeProviderScript() {
  return (
    <Script
      id="suqnaa-challenge-provider"
      src={providerScriptUrl}
      strategy="afterInteractive"
    />
  );
}
