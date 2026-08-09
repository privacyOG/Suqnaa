import assert from 'node:assert/strict';
import { evaluateRiskRule, type RiskRuleDefinition } from './marketplace-risk-service.js';

function rule(overrides: Partial<RiskRuleDefinition> = {}): RiskRuleDefinition {
  return {
    id: '123e4567-e89b-42d3-a456-426614174000',
    ruleKey: 'test.event_velocity',
    category: 'velocity_anomaly',
    severity: 'medium',
    score: 60,
    windowSeconds: 300,
    thresholdCount: 3,
    thresholdAmount: null,
    configuration: { eventTypes: ['test.event'], metric: 'event_count' },
    ...overrides
  };
}

assert.equal(evaluateRiskRule(rule(), { eventType: 'other.event', eventCount: 10 }), null);
assert.equal(evaluateRiskRule(rule(), { eventType: 'test.event', eventCount: 2 }), null);

const countMatch = evaluateRiskRule(rule(), { eventType: 'test.event', eventCount: 3 });
assert.ok(countMatch);
assert.equal(countMatch.metric, 'event_count');
assert.equal(countMatch.observedValue, 3);
assert.equal(countMatch.thresholdValue, 3);

const identityMatch = evaluateRiskRule(rule({
  ruleKey: 'identity.shared_identifier',
  category: 'duplicate_identity',
  severity: 'critical',
  score: 90,
  thresholdCount: 2,
  configuration: { eventTypes: ['identity.link_observed'], metric: 'distinct_accounts' }
}), {
  eventType: 'identity.link_observed',
  distinctAccounts: 2
});
assert.ok(identityMatch);
assert.equal(identityMatch.metric, 'distinct_accounts');

const amountRule = rule({
  ruleKey: 'payment.high_amount',
  category: 'offer_payment_fraud',
  thresholdCount: null,
  thresholdAmount: 1000,
  configuration: { eventTypes: ['payment.created'], metric: 'amount' }
});
assert.equal(evaluateRiskRule(amountRule, { eventType: 'payment.created', amount: 999.99 }), null);
const amountMatch = evaluateRiskRule(amountRule, { eventType: 'payment.created', amount: 1000 });
assert.ok(amountMatch);
assert.equal(amountMatch.metric, 'amount');
assert.equal(amountMatch.thresholdValue, 1000);

const defaultCount = evaluateRiskRule(rule({ thresholdCount: 1 }), { eventType: 'test.event' });
assert.ok(defaultCount);
assert.equal(defaultCount.observedValue, 1);

console.log('Marketplace risk evaluator passed.');
