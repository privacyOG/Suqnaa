import assert from 'node:assert/strict';
import { recordQueueAudit } from './queue-audit.js';

function sampleInput(createdAt: Date) {
  return {
    actorId: '123e4567-e89b-42d3-a456-426614174000',
    action: 'operations.queue.complete',
    entityType: 'report',
    entityId: '123e4567-e89b-42d3-a456-426614174111',
    ipAddress: '203.0.113.10',
    metadata: {
      queueItemId: '123e4567-e89b-42d3-a456-426614174222',
      result: 'no_change',
      noteProvided: true
    },
    createdAt
  };
}

async function run() {
  const createdAt = new Date('2026-06-30T00:00:00.000Z');
  const calls: Array<{ table: string; value: Record<string, unknown> }> = [];
  const writer = {
    insertInto(table: 'audit_logs') {
      return {
        values(value: Record<string, unknown>) {
          calls.push({ table, value });
          return {
            execute: async () => ({ rowCount: 1 })
          };
        }
      };
    }
  };

  await recordQueueAudit(writer, sampleInput(createdAt));

  assert.equal(calls.length, 1);
  assert.equal(calls[0].table, 'audit_logs');
  assert.deepEqual(calls[0].value, {
    actor_user_id: '123e4567-e89b-42d3-a456-426614174000',
    action: 'operations.queue.complete',
    entity_type: 'report',
    entity_id: '123e4567-e89b-42d3-a456-426614174111',
    ip_address: '203.0.113.10',
    metadata: {
      queueItemId: '123e4567-e89b-42d3-a456-426614174222',
      result: 'no_change',
      noteProvided: true
    },
    created_at: createdAt
  });

  const failure = new Error('write failed');
  const failingWriter = {
    insertInto() {
      return {
        values() {
          return {
            execute: async () => {
              throw failure;
            }
          };
        }
      };
    }
  };

  await assert.rejects(
    () => recordQueueAudit(failingWriter, sampleInput(createdAt)),
    failure
  );
}

void run();
