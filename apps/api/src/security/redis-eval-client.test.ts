import assert from 'node:assert/strict';
import { redisEvalClientInternals } from './redis-eval-client.js';

const encoded = redisEvalClientInternals.encodeCommand(['PING', 'hello']);
assert.equal(encoded.toString('utf8'), '*2\r\n$4\r\nPING\r\n$5\r\nhello\r\n');

const integerReply = redisEvalClientInternals.parseReply(Buffer.from(':42\r\n'));
assert.deepEqual(integerReply, { value: 42, nextOffset: 5 });

const arrayReply = redisEvalClientInternals.parseReply(Buffer.from('*4\r\n:1\r\n:2\r\n$3\r\nabc\r\n$-1\r\n'));
assert.deepEqual(arrayReply?.value, [1, 2, 'abc', null]);

const incomplete = redisEvalClientInternals.parseReply(Buffer.from('$5\r\nhel'));
assert.equal(incomplete, undefined);

const plain = redisEvalClientInternals.parseConnectionConfig('redis://:secret@redis:6380/3');
assert.deepEqual(plain, {
  secure: false,
  host: 'redis',
  port: 6380,
  username: undefined,
  password: 'secret',
  database: 3
});

const secure = redisEvalClientInternals.parseConnectionConfig('rediss://user:p%40ss@example.com/0');
assert.deepEqual(secure, {
  secure: true,
  host: 'example.com',
  port: 6379,
  username: 'user',
  password: 'p@ss',
  database: 0
});

assert.throws(
  () => redisEvalClientInternals.parseConnectionConfig('http://localhost:6379'),
  /redis:\/\/ or rediss:\/\//
);

assert.throws(
  () => redisEvalClientInternals.parseReply(Buffer.from('-ERR denied\r\n')),
  /Redis command failed: ERR denied/
);

console.log('redis eval client tests passed');
