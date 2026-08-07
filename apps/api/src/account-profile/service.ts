import { db } from '../db/index.js';
import type { ListingMediaStorage } from '../media/listing-media-storage.js';
import { verifyPassword } from '../security/password.js';

export type ProfileVisibility = 'public' | 'private';
export type AccountClosureMode = 'close' | 'delete';

export interface AccountProfileInput {
  displayName: string;
  bio: string | null;
  city: string | null;
  countryCode: string | null;
  isBusiness: boolean;
  businessName: string | null;
  businessDescription: string | null;
  businessWebsite: string | null;
  profileVisibility: ProfileVisibility;
  showCity: boolean;
  showCountry: boolean;
  showBusinessDetails: boolean;
  showAvatar: boolean;
}

export type CloseAccountResult =
  | {
      outcome: 'closed';
      mode: AccountClosureMode;
      revokedSessions: number;
      removedListings: number;
      cancelledOffers: number;
    }
  | { outcome: 'invalid_password' }
  | { outcome: 'not_available' };

export async function readAccountProfile(userId: string) {
  const user = await db.selectFrom('users')
    .select([
      'id',
      'email',
      'phone_e164',
      'display_name',
      'status',
      'email_verified_at',
      'phone_verified_at',
      'created_at',
      'updated_at',
      'closed_at',
      'deletion_requested_at',
      'anonymized_at'
    ])
    .where('id', '=', userId)
    .executeTakeFirst();

  if (!user) {
    return null;
  }

  const profile = await db.selectFrom('user_profiles')
    .select([
      'bio',
      'city',
      'country_code',
      'is_business',
      'business_name',
      'business_description',
      'business_website',
      'profile_visibility',
      'show_city',
      'show_country',
      'show_business_details',
      'show_avatar',
      'avatar_object_key',
      'avatar_mime_type',
      'avatar_size_bytes',
      'created_at',
      'updated_at'
    ])
    .where('user_id', '=', userId)
    .executeTakeFirst();

  return {
    user: {
      id: user.id,
      email: user.email ?? null,
      phoneE164: user.phone_e164 ?? null,
      displayName: user.display_name,
      status: user.status,
      emailVerifiedAt: user.email_verified_at ?? null,
      phoneVerifiedAt: user.phone_verified_at ?? null,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
      closedAt: user.closed_at ?? null,
      deletionRequestedAt: user.deletion_requested_at ?? null,
      anonymizedAt: user.anonymized_at ?? null
    },
    profile: {
      bio: profile?.bio ?? null,
      city: profile?.city ?? null,
      countryCode: profile?.country_code ?? null,
      isBusiness: Boolean(profile?.is_business),
      businessName: profile?.business_name ?? null,
      businessDescription: profile?.business_description ?? null,
      businessWebsite: profile?.business_website ?? null,
      profileVisibility: profile?.profile_visibility ?? 'private',
      showCity: Boolean(profile?.show_city),
      showCountry: profile?.show_country !== false,
      showBusinessDetails: profile?.show_business_details !== false,
      showAvatar: profile?.show_avatar !== false,
      hasAvatar: Boolean(profile?.avatar_object_key),
      avatarUrl: profile?.avatar_object_key ? '/v1/account/profile/avatar' : null,
      avatarMimeType: profile?.avatar_mime_type ?? null,
      avatarSizeBytes: profile?.avatar_size_bytes ?? null,
      createdAt: profile?.created_at ?? null,
      updatedAt: profile?.updated_at ?? null
    }
  };
}

export async function buildAccountExport(userId: string) {
  const profile = await readAccountProfile(userId);
  if (!profile) {
    return null;
  }

  const [listings, offers, transactions, conversations, messages, reports] = await Promise.all([
    db.selectFrom('listings')
      .select([
        'id', 'category_id', 'title', 'description', 'price_amount', 'currency_code',
        'condition', 'status', 'country_code', 'region', 'city', 'suburb',
        'allow_pickup', 'allow_delivery', 'published_at', 'expires_at', 'created_at', 'updated_at'
      ])
      .where('seller_id', '=', userId)
      .orderBy('created_at', 'asc')
      .execute(),
    db.selectFrom('offers')
      .select([
        'id', 'listing_id', 'amount', 'currency_code', 'status', 'message',
        'expires_at', 'created_at', 'updated_at'
      ])
      .where('buyer_id', '=', userId)
      .orderBy('created_at', 'asc')
      .execute(),
    db.selectFrom('transactions')
      .select([
        'id', 'listing_id', 'offer_id', 'buyer_id', 'seller_id', 'amount',
        'currency_code', 'status', 'created_at', 'updated_at'
      ])
      .where((expression) => expression.or([
        expression('buyer_id', '=', userId),
        expression('seller_id', '=', userId)
      ]))
      .orderBy('created_at', 'asc')
      .execute(),
    db.selectFrom('conversations')
      .select(['id', 'listing_id', 'buyer_id', 'seller_id', 'created_at', 'updated_at'])
      .where((expression) => expression.or([
        expression('buyer_id', '=', userId),
        expression('seller_id', '=', userId)
      ]))
      .orderBy('created_at', 'asc')
      .execute(),
    db.selectFrom('messages')
      .innerJoin('conversations', 'conversations.id', 'messages.conversation_id')
      .select([
        'messages.id as id',
        'messages.conversation_id as conversation_id',
        'messages.sender_id as sender_id',
        'messages.body as body',
        'messages.created_at as created_at',
        'messages.read_at as read_at'
      ])
      .where((expression) => expression.or([
        expression('conversations.buyer_id', '=', userId),
        expression('conversations.seller_id', '=', userId)
      ]))
      .orderBy('messages.created_at', 'asc')
      .execute(),
    db.selectFrom('reports')
      .select(['id', 'listing_id', 'reported_user_id', 'reason', 'details', 'resolved_at', 'created_at'])
      .where('reporter_id', '=', userId)
      .orderBy('created_at', 'asc')
      .execute()
  ]);

  const generatedAt = new Date();
  await db.insertInto('audit_logs')
    .values({
      actor_user_id: userId,
      action: 'account.exported',
      entity_type: 'user',
      entity_id: userId,
      metadata: {
        listings: listings.length,
        offers: offers.length,
        transactions: transactions.length,
        conversations: conversations.length,
        messages: messages.length,
        reports: reports.length
      },
      created_at: generatedAt
    })
    .execute();

  return {
    generatedAt,
    account: profile,
    marketplaceData: {
      listings,
      offers,
      transactions,
      conversations,
      messages,
      reports
    },
    exclusions: [
      'password hashes and authentication secrets',
      'internal fraud and moderation signals',
      'private contact information belonging to other accounts'
    ]
  };
}

export async function closeAccount(input: {
  userId: string;
  currentPassword: string;
  mode: AccountClosureMode;
  ipAddress?: string;
  storage: ListingMediaStorage;
}): Promise<CloseAccountResult> {
  const now = new Date();

  return db.transaction().execute(async (transaction) => {
    const user = await transaction.selectFrom('users')
      .select(['id', 'password_hash', 'status'])
      .where('id', '=', input.userId)
      .forUpdate()
      .executeTakeFirst();

    if (!user || user.status === 'closed' || !user.password_hash) {
      return { outcome: 'not_available' } as CloseAccountResult;
    }

    if (!(await verifyPassword(user.password_hash, input.currentPassword))) {
      return { outcome: 'invalid_password' } as CloseAccountResult;
    }

    const profile = await transaction.selectFrom('user_profiles')
      .select(['avatar_object_key'])
      .where('user_id', '=', input.userId)
      .forUpdate()
      .executeTakeFirst();

    if (input.mode === 'delete' && profile?.avatar_object_key) {
      await input.storage.remove(String(profile.avatar_object_key));
    }

    const removedListings = await transaction.updateTable('listings')
      .set({ status: 'removed', updated_at: now })
      .where('seller_id', '=', input.userId)
      .where('status', 'in', ['draft', 'active', 'expired'])
      .returning(['id'])
      .execute();

    const cancelledOffers = await transaction.updateTable('offers')
      .set({ status: 'cancelled', updated_at: now })
      .where('buyer_id', '=', input.userId)
      .where('status', '=', 'pending')
      .returning(['id'])
      .execute();

    const revokedSessions = await transaction.updateTable('refresh_sessions')
      .set({ revoked_at: now })
      .where('user_id', '=', input.userId)
      .where('revoked_at', 'is', null)
      .returning(['id'])
      .execute();

    await transaction.updateTable('password_reset_tokens')
      .set({ invalidated_at: now })
      .where('user_id', '=', input.userId)
      .where('consumed_at', 'is', null)
      .where('invalidated_at', 'is', null)
      .execute();

    await transaction.updateTable('account_contact_verifications')
      .set({ invalidated_at: now })
      .where('user_id', '=', input.userId)
      .where('consumed_at', 'is', null)
      .where('invalidated_at', 'is', null)
      .execute();

    const profileValues = input.mode === 'delete'
      ? {
          avatar_object_key: null,
          avatar_mime_type: null,
          avatar_size_bytes: null,
          avatar_sha256: null,
          bio: null,
          city: null,
          country_code: null,
          is_business: false,
          business_name: null,
          business_description: null,
          business_website: null,
          profile_visibility: 'private',
          show_city: false,
          show_country: false,
          show_business_details: false,
          show_avatar: false,
          updated_at: now
        }
      : {
          profile_visibility: 'private',
          show_city: false,
          show_country: false,
          show_business_details: false,
          show_avatar: false,
          updated_at: now
        };

    await transaction.updateTable('user_profiles')
      .set(profileValues)
      .where('user_id', '=', input.userId)
      .execute();

    const userValues = input.mode === 'delete'
      ? {
          email: `deleted-${input.userId}@account.invalid`,
          phone_e164: null,
          display_name: 'Deleted account',
          password_hash: null,
          status: 'closed',
          email_verified_at: null,
          phone_verified_at: null,
          closed_at: now,
          deletion_requested_at: now,
          anonymized_at: now,
          updated_at: now
        }
      : {
          status: 'closed',
          closed_at: now,
          updated_at: now
        };

    await transaction.updateTable('users')
      .set(userValues)
      .where('id', '=', input.userId)
      .execute();

    await transaction.insertInto('audit_logs')
      .values({
        actor_user_id: input.userId,
        action: input.mode === 'delete'
          ? 'account.deletion.anonymized'
          : 'account.closed',
        entity_type: 'user',
        entity_id: input.userId,
        ip_address: input.ipAddress ?? null,
        metadata: {
          mode: input.mode,
          revokedSessions: revokedSessions.length,
          removedListings: removedListings.length,
          cancelledOffers: cancelledOffers.length
        },
        created_at: now
      })
      .execute();

    return {
      outcome: 'closed',
      mode: input.mode,
      revokedSessions: revokedSessions.length,
      removedListings: removedListings.length,
      cancelledOffers: cancelledOffers.length
    } as CloseAccountResult;
  });
}
