import { closeDb } from '../db/index.js';
import { bootstrapPlatformAdministrator } from './role-service.js';

const userId = process.argv[2]?.trim();
if (!userId || !/^[0-9a-fA-F-]{36}$/.test(userId)) {
  console.error('Usage: pnpm --filter suqnaa-api admin:bootstrap -- <active-user-uuid>');
  process.exitCode = 2;
} else {
  try {
    const assignmentId = await bootstrapPlatformAdministrator(userId);
    console.log(`Platform administrator bootstrapped with assignment ${assignmentId}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Administrative bootstrap failed');
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
