import { db } from '../db/index.js';
import type { AccountProfileInput } from './service.js';

export async function saveAccountProfile(userId: string, input: AccountProfileInput): Promise<boolean> {
  const now = new Date();
  return db.transaction().execute(async (transaction) => {
    const user = await transaction.selectFrom('users')
      .select(['id', 'status'])
      .where('id', '=', userId)
      .forUpdate()
      .executeTakeFirst();

    if (!user || user.status === 'closed') {
      return false;
    }

    await transaction.updateTable('users')
      .set({ display_name: input.displayName, updated_at: now })
      .where('id', '=', userId)
      .execute();

    const values = {
      bio: input.bio,
      city: input.city,
      country_code: input.countryCode,
      is_business: input.isBusiness,
      business_name: input.isBusiness ? input.businessName : null,
      business_description: input.isBusiness ? input.businessDescription : null,
      business_website: input.isBusiness ? input.businessWebsite : null,
      profile_visibility: input.profileVisibility,
      show_city: input.showCity,
      show_country: input.showCountry,
      show_business_details: input.showBusinessDetails,
      show_avatar: input.showAvatar,
      updated_at: now
    };

    await transaction.insertInto('user_profiles')
      .values({ user_id: userId, ...values, created_at: now })
      .onConflict((conflict) => conflict.column('user_id').doUpdateSet(values))
      .execute();

    await transaction.insertInto('audit_logs')
      .values({
        actor_user_id: userId,
        action: 'account.profile.updated',
        entity_type: 'user',
        entity_id: userId,
        metadata: {
          profileVisibility: input.profileVisibility,
          isBusiness: input.isBusiness,
          showCity: input.showCity,
          showCountry: input.showCountry,
          showBusinessDetails: input.showBusinessDetails,
          showAvatar: input.showAvatar
        },
        created_at: now
      })
      .execute();

    return true;
  });
}
