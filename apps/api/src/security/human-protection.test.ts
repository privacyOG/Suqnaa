import { checkHumanProtection } from './human-protection.js';

const allowed = checkHumanProtection({
  action: 'listing.create',
  accountId: 'account_123',
  ip: '127.0.0.1',
  userAgent: 'SuqnaaTest/1.0'
});

if (allowed.decision !== 'allow') {
  throw new Error('Expected normal listing creation to be allowed');
}

const challenged = checkHumanProtection({
  action: 'listing.create'
});

if (challenged.decision !== 'challenge' && challenged.decision !== 'allow') {
  throw new Error('Unexpected protection decision');
}
