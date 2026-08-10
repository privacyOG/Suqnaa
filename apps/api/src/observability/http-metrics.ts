const durationBucketsMs = [25, 50, 100, 250, 500, 1000, 2500, 5000] as const;

type Key = string;

type MetricRecord = {
  method: string;
  route: string;
  statusClass: string;
  count: number;
  durationSumMs: number;
  buckets: number[];
};

function escapeLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

export class HttpMetricsRegistry {
  private readonly records = new Map<Key, MetricRecord>();
  private readonly startedAt = Date.now();

  observe(input: { method: string; route: string; statusClass: string; durationMs: number }): void {
    const method = input.method.toUpperCase().slice(0, 12);
    const route = input.route.slice(0, 200);
    const statusClass = input.statusClass.slice(0, 16);
    const key = `${method}\u0000${route}\u0000${statusClass}`;
    let record = this.records.get(key);
    if (!record) {
      record = {
        method,
        route,
        statusClass,
        count: 0,
        durationSumMs: 0,
        buckets: durationBucketsMs.map(() => 0)
      };
      this.records.set(key, record);
    }
    const durationMs = Number.isFinite(input.durationMs) && input.durationMs >= 0
      ? input.durationMs
      : 0;
    record.count += 1;
    record.durationSumMs += durationMs;
    for (let index = 0; index < durationBucketsMs.length; index += 1) {
      if (durationMs <= durationBucketsMs[index]) record.buckets[index] += 1;
    }
  }

  renderPrometheus(): string {
    const lines = [
      '# HELP suqnaa_process_uptime_seconds API process uptime.',
      '# TYPE suqnaa_process_uptime_seconds gauge',
      `suqnaa_process_uptime_seconds ${Math.max(0, (Date.now() - this.startedAt) / 1000).toFixed(3)}`,
      '# HELP suqnaa_http_requests_total HTTP requests by bounded route template, method and status class.',
      '# TYPE suqnaa_http_requests_total counter',
      '# HELP suqnaa_http_request_duration_ms HTTP request duration histogram in milliseconds.',
      '# TYPE suqnaa_http_request_duration_ms histogram'
    ];

    for (const record of this.records.values()) {
      const labels = `method="${escapeLabel(record.method)}",route="${escapeLabel(record.route)}",status_class="${escapeLabel(record.statusClass)}"`;
      lines.push(`suqnaa_http_requests_total{${labels}} ${record.count}`);
      for (let index = 0; index < durationBucketsMs.length; index += 1) {
        lines.push(`suqnaa_http_request_duration_ms_bucket{${labels},le="${durationBucketsMs[index]}"} ${record.buckets[index]}`);
      }
      lines.push(`suqnaa_http_request_duration_ms_bucket{${labels},le="+Inf"} ${record.count}`);
      lines.push(`suqnaa_http_request_duration_ms_sum{${labels}} ${record.durationSumMs.toFixed(3)}`);
      lines.push(`suqnaa_http_request_duration_ms_count{${labels}} ${record.count}`);
    }

    return `${lines.join('\n')}\n`;
  }
}

export const httpMetrics = new HttpMetricsRegistry();
