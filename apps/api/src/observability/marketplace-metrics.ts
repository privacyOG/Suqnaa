type MarketplaceMetricKey = string;

type MarketplaceMetricCategory = 'reliability' | 'abuse' | 'conversion' | 'support';

type MarketplaceMetricRecord = {
  category: MarketplaceMetricCategory;
  event: string;
  outcome: string;
  count: number;
};

type MarketplaceMetricIncrement = Omit<MarketplaceMetricRecord, 'count'> & {
  count?: number;
};

const bounded = /^[a-z][a-z0-9_]{0,47}$/;

function key(category: string, event: string, outcome: string): MarketplaceMetricKey {
  return `${category}\u0000${event}\u0000${outcome}`;
}

function escapeLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

export class MarketplaceMetricsRegistry {
  private readonly records = new Map<MarketplaceMetricKey, MarketplaceMetricRecord>();

  increment(input: MarketplaceMetricIncrement): void {
    if (!bounded.test(input.event) || !bounded.test(input.outcome)) {
      throw new Error('Marketplace metric labels must be bounded safe identifiers');
    }
    const amount = input.count ?? 1;
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new Error('Marketplace metric increment must be a positive safe integer');
    }
    const metricKey = key(input.category, input.event, input.outcome);
    const current = this.records.get(metricKey);
    if (current) {
      current.count += amount;
      return;
    }
    this.records.set(metricKey, {
      category: input.category,
      event: input.event,
      outcome: input.outcome,
      count: amount
    });
  }

  observeHttp(input: { method: string; route: string; statusCode: number }): void {
    const method = input.method.toUpperCase();
    const route = input.route;
    const outcome = input.statusCode >= 200 && input.statusCode < 400 ? 'success' : 'failure';

    this.increment({ category: 'reliability', event: 'api_request', outcome });

    if (method === 'POST' && route === '/v1/auth/register') {
      this.increment({ category: 'conversion', event: 'registration', outcome });
    }
    if (method === 'POST' && route.startsWith('/v1/listings')) {
      this.increment({ category: 'conversion', event: 'listing_write', outcome });
    }
    if (method === 'POST' && (route.startsWith('/v1/market/offers') || route.includes('/offers'))) {
      this.increment({ category: 'conversion', event: 'offer_submit', outcome });
    }
    if (method === 'POST' && (route.includes('/checkout') || route.startsWith('/v1/payments'))) {
      this.increment({ category: 'conversion', event: 'payment_action', outcome });
    }
    if (method === 'POST' && route.startsWith('/v1/reports')) {
      this.increment({ category: 'abuse', event: 'report_submit', outcome });
      this.increment({ category: 'support', event: 'safety_case', outcome });
    }
    if (method === 'POST' && route.startsWith('/v1/disputes')) {
      this.increment({ category: 'support', event: 'dispute_case', outcome });
    }
    if (route.startsWith('/v1/auth/') && input.statusCode >= 400) {
      this.increment({ category: 'abuse', event: 'auth_rejected', outcome: 'rejected' });
    }
  }

  renderPrometheus(): string {
    const lines = [
      '# HELP suqnaa_marketplace_events_total Privacy-safe aggregate marketplace events for beta operations.',
      '# TYPE suqnaa_marketplace_events_total counter'
    ];
    for (const record of this.records.values()) {
      const labels = `category="${escapeLabel(record.category)}",event="${escapeLabel(record.event)}",outcome="${escapeLabel(record.outcome)}"`;
      lines.push(`suqnaa_marketplace_events_total{${labels}} ${record.count}`);
    }
    return `${lines.join('\n')}\n`;
  }
}

export const marketplaceMetrics = new MarketplaceMetricsRegistry();
