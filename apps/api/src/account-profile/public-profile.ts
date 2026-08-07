import { db } from '../db/index.js';

export async function readVisiblePublicProfile(userId: string) {
  const user = await db.selectFrom('users')
    .select(['id', 'display_name', 'status', 'created_at'])
    .where('id', '=', userId)
    .executeTakeFirst();

  if (!user || user.status !== 'active') {
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
      'avatar_object_key'
    ])
    .where('user_id', '=', userId)
    .executeTakeFirst();

  if (!profile || profile.profile_visibility !== 'public') {
    return null;
  }

  const showBusiness = profile.show_business_details !== false && Boolean(profile.is_business);
  return {
    id: user.id,
    displayName: user.display_name,
    bio: profile.bio ?? null,
    city: profile.show_city ? profile.city ?? null : null,
    countryCode: profile.show_country !== false ? profile.country_code ?? null : null,
    avatarUrl:
      profile.avatar_object_key && profile.show_avatar !== false
        ? `/v1/profiles/${user.id}/avatar`
        : null,
    business: showBusiness
      ? {
          name: profile.business_name ?? null,
          description: profile.business_description ?? null,
          website: profile.business_website ?? null
        }
      : null,
    memberSince: user.created_at
  };
}
