export interface ReadinessResult {
  ready: boolean;
  dependency: 'database';
  reason?: 'unavailable' | 'timeout';
}

export async function checkDatabaseReadiness(input: {
  probe: () => Promise<void>;
  timeoutMs?: number;
}): Promise<ReadinessResult> {
  const timeoutMs = input.timeoutMs ?? 2_000;
  let timeout: NodeJS.Timeout | undefined;

  try {
    await Promise.race([
      input.probe(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('readiness_timeout')), timeoutMs);
      })
    ]);

    return { ready: true, dependency: 'database' };
  } catch (error) {
    return {
      ready: false,
      dependency: 'database',
      reason: error instanceof Error && error.message === 'readiness_timeout' ? 'timeout' : 'unavailable'
    };
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}
