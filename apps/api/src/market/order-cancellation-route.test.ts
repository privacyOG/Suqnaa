import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const routeSource = readFileSync(
  new URL('../routes/order-cancellation.ts', import.meta.url),
  'utf8'
);
const serverSource = readFileSync(
  new URL('../server.ts', import.meta.url),
  'utf8'
);

assert.match(
  routeSource,
  /app\.post\(\s*['"]\/market\/orders\/:orderId\/cancel['"]/,
  'order cancellation route must remain registered as an authenticated POST'
);
assert.match(routeSource, /preHandler:\s*requireUser/);
assert.match(routeSource, /action:\s*['"]order\.cancel['"]/);
assert.match(routeSource, /checkHumanProtectionWithChallenge/);
assert.match(routeSource, /market\.orders\.cancel\.account/);
assert.match(routeSource, /market\.orders\.cancel\.ip/);
assert.match(routeSource, /updateTable\(['"]transactions['"]\)/);
assert.match(routeSource, /\.where\(['"]status['"],\s*['"]=['"],\s*['"]pending['"]\)/);
assert.match(routeSource, /\.where\(['"]payment_provider['"],\s*['"]is['"],\s*null\)/);
assert.match(routeSource, /\.where\(['"]payment_reference['"],\s*['"]is['"],\s*null\)/);
assert.match(routeSource, /updateTable\(['"]offers['"]\)/);
assert.match(routeSource, /\.where\(['"]status['"],\s*['"]=['"],\s*['"]accepted['"]\)/);
assert.match(routeSource, /updateTable\(['"]listings['"]\)/);
assert.match(routeSource, /\.set\(\{\s*status:\s*['"]active['"]/);
assert.match(routeSource, /db\.transaction\(\)\.execute/);
assert.match(routeSource, /writeSecurityAudit/);

assert.match(
  serverSource,
  /import \{ orderCancellationRoutes \} from ['"]\.\/routes\/order-cancellation\.js['"]/,
  'server must import the cancellation route'
);
assert.match(
  serverSource,
  /app\.register\(orderCancellationRoutes, \{ prefix: ['"]\/v1['"] \}\)/,
  'server must register the cancellation route under /v1'
);
