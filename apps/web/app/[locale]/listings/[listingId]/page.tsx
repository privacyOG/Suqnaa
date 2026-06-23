import { notFound } from 'next/navigation';
import { ListingBuyerActions } from '../../../../components/listing-buyer-actions';
import { SessionRefresh } from '../../../../components/session-refresh';
import { isLocale } from '../../../../i18n/locales';
import { loadAccountSessionState } from '../../../../lib/account-session-state';
import {
  getPublicListing,
  PublicListingRequestError,
  type PublicListingDetail
} from '../../../../lib/public-listing-api';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function formatPrice(listing: PublicListingDetail, locale: string): string {
  const amount = Number(listing.priceAmount);
  if (!Number.isFinite(amount)) {
    return `${listing.priceAmount} ${listing.currencyCode}`;
  }

  try {
    return new Intl.NumberFormat(locale === 'ar' ? 'ar-AU' : 'en-AU', {
      style: 'currency',
      currency: listing.currencyCode,
      maximumFractionDigits: 2
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${listing.currencyCode}`;
  }
}

function formatDate(value: string | null, locale: string): string {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-AU' : 'en-AU', {
    dateStyle: 'medium'
  }).format(date);
}

function conditionLabel(condition: PublicListingDetail['condition'], isArabic: boolean): string {
  const labels: Record<PublicListingDetail['condition'], [string, string]> = {
    new: ['New', 'جديد'],
    like_new: ['Like new', 'كالجديد'],
    good: ['Good', 'جيد'],
    fair: ['Fair', 'مقبول'],
    parts_or_repair: ['Parts or repair', 'للقطع أو الإصلاح']
  };
  return labels[condition][isArabic ? 1 : 0];
}

function verificationLabel(status: string, isArabic: boolean): string {
  const values: Record<string, [string, string]> = {
    verified: ['Verified', 'موثّق'],
    pending: ['Verification pending', 'التوثيق قيد المراجعة'],
    rejected: ['Not verified', 'غير موثّق'],
    expired: ['Verification expired', 'انتهى التوثيق'],
    unverified: ['Not verified', 'غير موثّق']
  };
  return (values[status] ?? values.unverified)[isArabic ? 1 : 0];
}

export default async function ListingDetailPage({
  params
}: {
  params: { locale: string; listingId: string };
}) {
  if (!isLocale(params.locale) || !uuidPattern.test(params.listingId)) {
    notFound();
  }

  const isArabic = params.locale === 'ar';
  let listing: PublicListingDetail;

  try {
    listing = await getPublicListing(params.listingId);
  } catch (caught) {
    if (caught instanceof PublicListingRequestError && caught.status === 404) {
      notFound();
    }

    return (
      <main className="page-shell catalog-page">
        <nav className="top-nav">
          <a className="brand-word" href={`/${params.locale}`}>Suqnaa · سوقنا</a>
          <a href={`/${params.locale}/listings`}>{isArabic ? 'السوق' : 'Marketplace'}</a>
        </nav>
        <section className="listing-unavailable">
          <h1>{isArabic ? 'تعذر تحميل الإعلان' : 'Listing unavailable'}</h1>
          <p>
            {isArabic
              ? 'الخدمة غير متاحة مؤقتاً. أعد المحاولة بعد قليل.'
              : 'The service is temporarily unavailable. Try again shortly.'}
          </p>
          <a className="button-primary" href={`/${params.locale}/listings`}>
            {isArabic ? 'العودة إلى السوق' : 'Return to marketplace'}
          </a>
        </section>
      </main>
    );
  }

  const { user, needsRotation } = await loadAccountSessionState();
  const isSeller = user?.id === listing.seller.id;
  const location = [listing.suburb, listing.city, listing.region, listing.countryCode]
    .filter(Boolean)
    .join(', ');
  const categoryName = listing.category
    ? (isArabic ? listing.category.nameAr ?? listing.category.nameEn : listing.category.nameEn)
    : (isArabic ? 'أخرى' : 'Other');
  const sellerDisplayName = listing.seller.businessName || listing.seller.displayName;
  const verifiedContact = listing.seller.emailVerified || listing.seller.phoneVerified;

  return (
    <main className="page-shell catalog-page">
      <nav className="top-nav">
        <a className="brand-word" href={`/${params.locale}`}>Suqnaa · سوقنا</a>
        <div className="nav-links">
          <a href={`/${params.locale}/listings`}>{isArabic ? 'السوق' : 'Marketplace'}</a>
          <a href={`/${params.locale}/sell`}>{isArabic ? 'بيع' : 'Sell'}</a>
          <a href={`/${params.locale}/messages`}>{isArabic ? 'الرسائل' : 'Messages'}</a>
          <a href={`/${params.locale}/account`}>{isArabic ? 'الحساب' : 'Account'}</a>
        </div>
      </nav>

      <div className="listing-breadcrumbs">
        <a href={`/${params.locale}/listings`}>{isArabic ? 'السوق' : 'Marketplace'}</a>
        <span>›</span>
        <span>{categoryName}</span>
      </div>

      <section className="listing-detail-layout">
        <div className="listing-detail-main">
          {listing.media && listing.media.length > 0 ? (
            <div className="listing-media-gallery" aria-label={isArabic ? 'صور الإعلان' : 'Listing photos'}>
              {listing.media.map((item, index) =>
                item.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={item.id}
                    src={item.url}
                    alt={`${listing.title} — ${isArabic ? 'صورة' : 'photo'} ${index + 1}`}
                    className={`listing-media-img${index === 0 ? ' listing-media-img--cover' : ''}`}
                    style={{ objectFit: 'cover' }}
                  />
                ) : null
              )}
            </div>
          ) : (
            <div className="listing-media-placeholder" aria-label={isArabic ? 'صورة الإعلان' : 'Listing image'}>
              <span>{listing.title.slice(0, 1).toUpperCase()}</span>
              <small>{isArabic ? 'لا توجد صور بعد' : 'No photos yet'}</small>
            </div>
          )}

          <article className="listing-description-card">
            <div className="listing-detail-tags">
              <span>{categoryName}</span>
              <span>{conditionLabel(listing.condition, isArabic)}</span>
              <span>{isArabic ? 'نشط' : 'Active'}</span>
            </div>
            <h1>{listing.title}</h1>
            <p className="listing-detail-price">{formatPrice(listing, params.locale)}</p>
            <p className="listing-detail-location">
              {location || (isArabic ? 'الموقع غير محدد' : 'Location not specified')}
            </p>
            <div className="listing-description-text">{listing.description}</div>

            <dl className="listing-facts">
              <div>
                <dt>{isArabic ? 'الحالة' : 'Condition'}</dt>
                <dd>{conditionLabel(listing.condition, isArabic)}</dd>
              </div>
              <div>
                <dt>{isArabic ? 'نشر في' : 'Published'}</dt>
                <dd>{formatDate(listing.publishedAt ?? listing.createdAt, params.locale)}</dd>
              </div>
              <div>
                <dt>{isArabic ? 'الاستلام' : 'Pickup'}</dt>
                <dd>{listing.allowPickup ? (isArabic ? 'متاح' : 'Available') : (isArabic ? 'غير متاح' : 'Unavailable')}</dd>
              </div>
              <div>
                <dt>{isArabic ? 'التوصيل' : 'Delivery'}</dt>
                <dd>{listing.allowDelivery ? (isArabic ? 'متاح' : 'Available') : (isArabic ? 'غير متاح' : 'Unavailable')}</dd>
              </div>
            </dl>
          </article>
        </div>

        <aside className="listing-seller-card">
          <span className="buyer-action-label">{isArabic ? 'البائع' : 'Seller'}</span>
          <div className="seller-avatar" aria-hidden="true">
            {sellerDisplayName.slice(0, 1).toUpperCase()}
          </div>
          <h2>{sellerDisplayName}</h2>
          {listing.seller.isBusiness ? (
            <span className="seller-business-badge">{isArabic ? 'حساب تجاري' : 'Business seller'}</span>
          ) : null}
          <dl>
            <div>
              <dt>{isArabic ? 'التوثيق' : 'Verification'}</dt>
              <dd>{verificationLabel(listing.seller.verification.status, isArabic)}</dd>
            </div>
            <div>
              <dt>{isArabic ? 'وسيلة اتصال موثقة' : 'Verified contact'}</dt>
              <dd>{verifiedContact ? (isArabic ? 'نعم' : 'Yes') : (isArabic ? 'لا' : 'No')}</dd>
            </div>
            <div>
              <dt>{isArabic ? 'درجة الثقة' : 'Trust score'}</dt>
              <dd>{listing.seller.trustScore}/100</dd>
            </div>
          </dl>
          <p className="seller-safety-note">
            {isArabic
              ? 'حافظ على التواصل والدفع داخل سوقنا، ولا ترسل رموز التحقق أو كلمات المرور.'
              : 'Keep communication and payment inside Suqnaa. Never share verification codes or passwords.'}
          </p>
        </aside>
      </section>

      <section className="listing-buyer-section">
        {isSeller ? (
          <div className="owner-listing-panel">
            <strong>{isArabic ? 'هذا إعلانك' : 'This is your listing'}</strong>
            <p>
              {isArabic
                ? 'يمكنك تحديث حالته من لوحة البائع.'
                : 'Manage its availability from your seller dashboard.'}
            </p>
            <a className="button-primary" href={`/${params.locale}/sell/manage`}>
              {isArabic ? 'إدارة إعلاناتي' : 'Manage my listings'}
            </a>
          </div>
        ) : user ? (
          <ListingBuyerActions
            locale={params.locale}
            listingId={listing.id}
            sellerId={listing.seller.id}
            sellerName={sellerDisplayName}
            priceAmount={listing.priceAmount}
            currencyCode={listing.currencyCode}
          />
        ) : needsRotation ? (
          <div className="buyer-session-panel">
            <SessionRefresh locale={params.locale} />
          </div>
        ) : (
          <div className="buyer-session-panel">
            <strong>{isArabic ? 'سجّل الدخول للتواصل أو تقديم عرض' : 'Sign in to contact the seller or make an offer'}</strong>
            <p>
              {isArabic
                ? 'حسابك يحمي المحادثات والعروض ويربطها بالإعلان الصحيح.'
                : 'Your account protects conversations and offers and ties them to the correct listing.'}
            </p>
            <div className="actions">
              <a className="button-primary" href={`/${params.locale}/account/sign-in`}>
                {isArabic ? 'تسجيل الدخول' : 'Sign in'}
              </a>
              <a className="button-secondary" href={`/${params.locale}/account/register`}>
                {isArabic ? 'إنشاء حساب' : 'Create account'}
              </a>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
