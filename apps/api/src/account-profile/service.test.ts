import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { closeDb, db } from '../db/index.js';
import type { ListingMediaStorage } from '../media/listing-media-storage.js';
import { hashPassword } from '../security/password.js';
import { saveAccountProfile } from './mutation.js';
import { buildAccountExport, closeAccount, readAccountProfile, readPublicProfile } from './service.js';

const closeUserId = randomUUID();
const deleteUserId = randomUUID();
const now = new Date();
const future = new Date(now.getTime() + 24 * 60 * 60 * 1000);
const removedKeys: string[] = [];

const fakeStorage: ListingMediaStorage = {
  driver: 'local',
  async put(input) {
    return { objectKey: input.objectKey, sha256: 'a'.repeat(64) };
  },
  async deliver() {
    throw new Error('not used');
  },
  async remove(objectKey) {
    removedKeys.push(objectKey);
  }
};

try {
  await db.insertInto('users').values([
    {
      id: closeUserId,
      email: 'profile-close@example.test',
      phone_e164: null,
      display_name: 'Close Profile',
      password_hash: await hashPassword('Close-profile-password-123'),
      status: 'active',
      email_verified_at: now,
      phone_verified_at: null,
      created_at: now,
      updated_at: now
    },
    {
      id: deleteUserId,
      email: 'profile-delete@example.test',
      phone_e164: null,
      display_name: 'Delete Profile',
      password_hash: await hashPassword('Delete-profile-password-123'),
      status: 'active',
      email_verified_at: now,
      phone_verified_at: null,
      created_at: now,
      updated_at: now
    }
  ]).execute();

  assert.equal(await saveAccountProfile(closeUserId, {
    displayName: 'Updated Close Profile',
    bio: 'Public marketplace bio',
    city: 'Sydney',
    countryCode: 'AU',
    isBusiness: true,
    businessName: 'Example Trading',
    businessDescription: 'Independent marketplace seller',
    businessWebsite: 'https://example.test',
    profileVisibility: 'public',
    showCity: false,
    showCountry: true,
    showBusinessDetails: true,
    showAvatar: true
  }), true);

  const ownerProfile = await readAccountProfile(closeUserId);
  assert.equal(ownerProfile?.user.displayName, 'Updated Close Profile');
  assert.equal(ownerProfile?.profile.city, 'Sydney');
  assert.equal(ownerProfile?.profile.isBusiness, true);

  const publicProfile = await readPublicProfile(closeUserId);
  assert.equal(publicProfile?.displayName, 'Updated Close Profile');
  assert.equal(publicProfile?.city, null);
  assert.equal(publicProfile?.countryCode, 'AU');
  assert.equal(publicProfile?.business?.name, 'Example Trading');

  const exported = await buildAccountExport(closeUserId);
  assert.equal(exported?.account.user.email, 'profile-close@example.test');
  assert.deepEqual(exported?.marketplaceData.listings, []);
  assert.ok(exported?.exclusions.some((value) => value.includes('authentication secrets')));

  await db.insertInto('refresh_sessions').values({
    user_id: closeUserId,
    token_hash: `profile-close-${randomUUID()}`,
    user_agent: 'test',
    ip_address: null,
    expires_at: future,
    revoked_at: null,
    created_at: now
  }).execute();

  const closed = await closeAccount({
    userId: closeUserId,
    currentPassword: 'Close-profile-password-123',
    mode: 'close',
    storage: fakeStorage
  });
  assert.equal(closed.outcome, 'closed');
  if (closed.outcome === 'closed') {
    assert.equal(closed.mode, 'close');
    assert.equal(closed.revokedSessions, 1);
  }

  const closedUser = await db.selectFrom('users')
    .select(['status', 'email', 'password_hash', 'closed_at'])
    .where('id', '=', closeUserId)
    .executeTakeFirstOrThrow();
  assert.equal(closedUser.status, 'closed');
  assert.equal(closedUser.email, 'profile-close@example.test');
  assert.ok(closedUser.password_hash);
  assert.ok(closedUser.closed_at);
  assert.equal(await readPublicProfile(closeUserId), null);

  await db.insertInto('user_profiles').values({
    user_id: deleteUserId,
    avatar_object_key: `profile-avatars/${deleteUserId}/avatar.webp`,
    avatar_mime_type: 'image/webp',
    avatar_size_bytes: 128,
    avatar_sha256: 'b'.repeat(64),
    bio: 'Delete me',
    city: 'Melbourne',
    country_code: 'AU',
    is_business: true,
    business_name: 'Delete Business',
    business_description: 'Delete description',
    business_website: 'https://delete.example.test',
    profile_visibility: 'public',
    show_city: true,
    show_country: true,
    show_business_details: true,
    show_avatar: true,
    created_at: now,
    updated_at: now
  }).execute();

  const invalid = await closeAccount({
    userId: deleteUserId,
    currentPassword: 'wrong-password',
    mode: 'delete',
    storage: fakeStorage
  });
  assert.deepEqual(invalid, { outcome: 'invalid_password' });
  assert.equal(removedKeys.length, 0);

  const deleted = await closeAccount({
    userId: deleteUserId,
    currentPassword: 'Delete-profile-password-123',
    mode: 'delete',
    storage: fakeStorage
  });
  assert.equal(deleted.outcome, 'closed');
  assert.equal(removedKeys.length, 1);

  const deletedUser = await db.selectFrom('users')
    .select([
      'email', 'phone_e164', 'display_name', 'password_hash', 'status',
      'email_verified_at', 'closed_at', 'deletion_requested_at', 'anonymized_at'
    ])
    .where('id', '=', deleteUserId)
    .executeTakeFirstOrThrow();
  assert.match(deletedUser.email, new RegExp(`^deleted-${deleteUserId}@account\\.invalid$`));
  assert.equal(deletedUser.phone_e164, null);
  assert.equal(deletedUser.display_name, 'Deleted account');
  assert.equal(deletedUser.password_hash, null);
  assert.equal(deletedUser.status, 'closed');
  assert.equal(deletedUser.email_verified_at, null);
  assert.ok(deletedUser.closed_at);
  assert.ok(deletedUser.deletion_requested_at);
  assert.ok(deletedUser.anonymized_at);

  const deletedProfile = await db.selectFrom('user_profiles')
    .select([
      'avatar_object_key', 'bio', 'city', 'country_code', 'is_business',
      'business_name', 'business_description', 'business_website',
      'profile_visibility', 'show_city', 'show_country', 'show_business_details', 'show_avatar'
    ])
    .where('user_id', '=', deleteUserId)
    .executeTakeFirstOrThrow();
  assert.equal(deletedProfile.avatar_object_key, null);
  assert.equal(deletedProfile.bio, null);
  assert.equal(deletedProfile.city, null);
  assert.equal(deletedProfile.is_business, false);
  assert.equal(deletedProfile.profile_visibility, 'private');
  assert.equal(deletedProfile.show_avatar, false);

  console.log('Account profile lifecycle service tests passed.');
} finally {
  await db.deleteFrom('users').where('id', 'in', [closeUserId, deleteUserId]).execute();
  await closeDb();
}
