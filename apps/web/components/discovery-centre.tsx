'use client';

import { useEffect, useMemo, useState } from 'react';
import { AuthedRequestError } from '../lib/authed-api';
import {
  createDiscoverySavedSearch,
  deleteDiscoverySavedSearch,
  getRecentlyViewed,
  getSavedListings,
  getSavedSearchNotifications,
  getSavedSearches,
  getWatchlist,
  markAllDiscoveryNotificationsRead,
  markDiscoveryNotificationRead,
  removeDiscoverySavedListing,
  removeDiscoveryWatchedListing,
  updateDiscoverySavedSearch,
  type DiscoveryRelationshipItem,
  type SavedSearch,
  type SavedSearchFilterInput,
  type SavedSearchNotification
} from '../lib/discovery-api';

function listingLocation(item: DiscoveryRelationshipItem): string {
  const listing = item.listing;
  if (!listing) return '';
  return [listing.suburb, listing.city, listing.region, listing.countryCode].filter(Boolean).join(', ');
}

function ListingRows({
  locale,
  items,
  empty,
  actionLabel,
  onRemove
}: {
  locale: string;
  items: DiscoveryRelationshipItem[];
  empty: string;
  actionLabel?: string;
  onRemove?: (listingId: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  if (items.length === 0) return <p>{empty}</p>;
  return (
    <div className="operations-list">
      {items.map((item) => (
        <article className="operation-card" key={item.listingId}>
          {item.listing ? (
            <>
              <strong>{item.listing.title}</strong>
              <p>{item.listing.priceAmount} {item.listing.currencyCode} · {listingLocation(item)}</p>
              <div className="actions">
                <a className="button-secondary" href={`/${locale}/listings/${item.listingId}`}>
                  {locale === 'ar' ? 'عرض الإعلان' : 'View listing'}
                </a>
                {onRemove && actionLabel ? (
                  <button className="button-secondary" type="button" disabled={busy !== null} onClick={async () => {
                    setBusy(item.listingId);
                    try { await onRemove(item.listingId); } finally { setBusy(null); }
                  }}>
                    {busy === item.listingId ? '…' : actionLabel}
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <strong>{locale === 'ar' ? 'الإعلان لم يعد متاحاً' : 'Listing no longer available'}</strong>
              <p>{locale === 'ar' ? 'لا نعرض بيانات إعلان غير نشط، ويمكنك إزالة المرجع من قائمتك.' : 'Inactive listing details are hidden; you can remove the saved reference.'}</p>
              {onRemove && actionLabel ? (
                <button className="button-secondary" type="button" disabled={busy !== null} onClick={async () => {
                  setBusy(item.listingId);
                  try { await onRemove(item.listingId); } finally { setBusy(null); }
                }}>{busy === item.listingId ? '…' : actionLabel}</button>
              ) : null}
            </>
          )}
        </article>
      ))}
    </div>
  );
}

export function DiscoveryCentre({ locale }: { locale: string }) {
  const isArabic = locale === 'ar';
  const [saved, setSaved] = useState<DiscoveryRelationshipItem[]>([]);
  const [watchlist, setWatchlist] = useState<DiscoveryRelationshipItem[]>([]);
  const [recent, setRecent] = useState<DiscoveryRelationshipItem[]>([]);
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [notifications, setNotifications] = useState<SavedSearchNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchName, setSearchName] = useState('');
  const [query, setQuery] = useState('');
  const [country, setCountry] = useState('AU');
  const [city, setCity] = useState('');
  const [condition, setCondition] = useState('');
  const [availability, setAvailability] = useState('');
  const [minimumPrice, setMinimumPrice] = useState('');
  const [maximumPrice, setMaximumPrice] = useState('');
  const [currency, setCurrency] = useState('AUD');
  const [fulfilment, setFulfilment] = useState('');

  const unreadCount = useMemo(
    () => notifications.filter((notification) => notification.readAt === null).length,
    [notifications]
  );

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const [savedItems, watchedItems, recentItems, savedSearches, alerts] = await Promise.all([
        getSavedListings(),
        getWatchlist(),
        getRecentlyViewed(),
        getSavedSearches(),
        getSavedSearchNotifications(false)
      ]);
      setSaved(savedItems);
      setWatchlist(watchedItems);
      setRecent(recentItems);
      setSearches(savedSearches);
      setNotifications(alerts);
    } catch (caught) {
      setError(caught instanceof AuthedRequestError
        ? caught.message
        : (isArabic ? 'تعذر تحميل مركز المتابعة.' : 'Unable to load discovery centre.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void reload(); }, []);

  async function createSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const filters: SavedSearchFilterInput = {
      ...(query.trim() ? { q: query.trim() } : {}),
      ...(country.trim() ? { country: country.trim() } : {}),
      ...(city.trim() ? { city: city.trim() } : {}),
      ...(condition ? { condition: condition as SavedSearchFilterInput['condition'] } : {}),
      ...(availability ? { availabilityStatus: availability as SavedSearchFilterInput['availabilityStatus'] } : {}),
      ...(minimumPrice ? { minPrice: Number(minimumPrice) } : {}),
      ...(maximumPrice ? { maxPrice: Number(maximumPrice) } : {}),
      ...((minimumPrice || maximumPrice) && currency.trim() ? { currency: currency.trim() } : {}),
      ...(fulfilment ? { fulfilment: fulfilment as SavedSearchFilterInput['fulfilment'] } : {})
    };
    try {
      await createDiscoverySavedSearch(
        searchName.trim() || query.trim() || (isArabic ? 'بحث محفوظ' : 'Saved search'),
        filters
      );
      setSearchName('');
      await reload();
    } catch (caught) {
      setError(caught instanceof AuthedRequestError ? caught.message : (isArabic ? 'تعذر حفظ البحث.' : 'Unable to save search.'));
    }
  }

  return (
    <section className="operations-shell">
      <div className="operations-toolbar">
        <div>
          <div className="eyebrow">{isArabic ? 'المتابعة' : 'Discovery'}</div>
          <h1>{isArabic ? 'المحفوظات والمراقبة والتنبيهات' : 'Saved items, watchlist and alerts'}</h1>
          <p>{isArabic
            ? 'احتفظ بالإعلانات، راقب ما يهمك، وراجع نتائج عمليات البحث المحفوظة.'
            : 'Keep listings for later, maintain a watchlist, and review saved-search matches.'}</p>
        </div>
        <button className="button-secondary" type="button" onClick={() => void reload()} disabled={loading}>
          {isArabic ? 'تحديث' : 'Refresh'}
        </button>
      </div>

      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      {loading ? <p>{isArabic ? 'جارٍ التحميل…' : 'Loading…'}</p> : null}

      <section className="operations-panel">
        <h2>{isArabic ? 'الإشعارات' : `Notifications (${unreadCount} unread)`}</h2>
        <div className="actions">
          <button className="button-secondary" type="button" disabled={unreadCount === 0} onClick={async () => {
            await markAllDiscoveryNotificationsRead();
            await reload();
          }}>{isArabic ? `تمييز الكل كمقروء (${unreadCount})` : 'Mark all read'}</button>
        </div>
        {notifications.length === 0 ? <p>{isArabic ? 'لا توجد تنبيهات بحث محفوظة.' : 'No saved-search alerts yet.'}</p> : (
          <div className="operations-list">
            {notifications.map((notification) => (
              <article className="operation-card" key={notification.id}>
                <strong>{notification.searchName}</strong>
                <p>{notification.listing?.title ?? (isArabic ? 'الإعلان لم يعد متاحاً' : 'Listing no longer available')}</p>
                <div className="actions">
                  {notification.available ? <a className="button-secondary" href={`/${locale}/listings/${notification.listingId}`}>{isArabic ? 'فتح الإعلان' : 'Open listing'}</a> : null}
                  {notification.readAt === null ? <button className="button-secondary" type="button" onClick={async () => {
                    await markDiscoveryNotificationRead(notification.id);
                    await reload();
                  }}>{isArabic ? 'تمييز كمقروء' : 'Mark read'}</button> : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="operations-panel">
        <h2>{isArabic ? 'إنشاء بحث محفوظ' : 'Create saved search'}</h2>
        <form className="catalog-filter-form" onSubmit={createSearch}>
          <label><span>{isArabic ? 'الاسم' : 'Name'}</span><input maxLength={120} value={searchName} onChange={(event) => setSearchName(event.target.value)} /></label>
          <label><span>{isArabic ? 'كلمات البحث' : 'Keywords'}</span><input maxLength={200} value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <label><span>{isArabic ? 'الدولة' : 'Country'}</span><input minLength={2} maxLength={2} value={country} onChange={(event) => setCountry(event.target.value.toUpperCase())} /></label>
          <label><span>{isArabic ? 'المدينة' : 'City'}</span><input maxLength={120} value={city} onChange={(event) => setCity(event.target.value)} /></label>
          <label><span>{isArabic ? 'الحالة' : 'Condition'}</span><select value={condition} onChange={(event) => setCondition(event.target.value)}><option value="">{isArabic ? 'الكل' : 'Any'}</option><option value="new">{isArabic ? 'جديد' : 'New'}</option><option value="like_new">{isArabic ? 'كالجديد' : 'Like new'}</option><option value="good">{isArabic ? 'جيد' : 'Good'}</option><option value="fair">{isArabic ? 'مقبول' : 'Fair'}</option><option value="parts_or_repair">{isArabic ? 'للقطع أو الإصلاح' : 'Parts or repair'}</option></select></label>
          <label><span>{isArabic ? 'التوفر' : 'Availability'}</span><select value={availability} onChange={(event) => setAvailability(event.target.value)}><option value="">{isArabic ? 'الكل' : 'Any'}</option><option value="in_stock">{isArabic ? 'متوفر' : 'In stock'}</option><option value="limited">{isArabic ? 'كمية محدودة' : 'Limited'}</option><option value="service_available">{isArabic ? 'خدمة' : 'Service'}</option></select></label>
          <label><span>{isArabic ? 'أقل سعر' : 'Minimum price'}</span><input type="number" min="0" step="0.01" value={minimumPrice} onChange={(event) => setMinimumPrice(event.target.value)} /></label>
          <label><span>{isArabic ? 'أعلى سعر' : 'Maximum price'}</span><input type="number" min="0" step="0.01" value={maximumPrice} onChange={(event) => setMaximumPrice(event.target.value)} /></label>
          <label><span>{isArabic ? 'العملة' : 'Currency'}</span><input minLength={3} maxLength={3} value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} /></label>
          <label><span>{isArabic ? 'الاستلام' : 'Fulfilment'}</span><select value={fulfilment} onChange={(event) => setFulfilment(event.target.value)}><option value="">{isArabic ? 'الكل' : 'Any'}</option><option value="pickup">{isArabic ? 'استلام' : 'Pickup'}</option><option value="delivery">{isArabic ? 'توصيل' : 'Delivery'}</option><option value="both">{isArabic ? 'كلاهما' : 'Both'}</option></select></label>
          <button className="button-primary" type="submit">{isArabic ? 'حفظ البحث' : 'Save search'}</button>
        </form>

        <div className="operations-list">
          {searches.map((search) => (
            <article className="operation-card" key={search.id}>
              <strong>{search.name}</strong>
              <pre>{JSON.stringify(search.filters, null, 2)}</pre>
              <div className="actions">
                <button className="button-secondary" type="button" onClick={async () => {
                  await updateDiscoverySavedSearch(search.id, { active: !search.active });
                  await reload();
                }}>{search.active ? (isArabic ? 'إيقاف' : 'Pause') : (isArabic ? 'تشغيل' : 'Resume')}</button>
                <button className="button-secondary" type="button" onClick={async () => {
                  await deleteDiscoverySavedSearch(search.id);
                  await reload();
                }}>{isArabic ? 'حذف' : 'Delete'}</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="operations-panel">
        <h2>{isArabic ? 'الإعلانات المحفوظة' : 'Saved listings'}</h2>
        <ListingRows locale={locale} items={saved} empty={isArabic ? 'لا توجد إعلانات محفوظة.' : 'No saved listings.'} actionLabel={isArabic ? 'إزالة' : 'Remove'} onRemove={async (listingId) => { await removeDiscoverySavedListing(listingId); await reload(); }} />
      </section>

      <section className="operations-panel">
        <h2>{isArabic ? 'قائمة المراقبة' : 'Watchlist'}</h2>
        <ListingRows locale={locale} items={watchlist} empty={isArabic ? 'قائمة المراقبة فارغة.' : 'Your watchlist is empty.'} actionLabel={isArabic ? 'إزالة' : 'Remove'} onRemove={async (listingId) => { await removeDiscoveryWatchedListing(listingId); await reload(); }} />
      </section>

      <section className="operations-panel">
        <h2>{isArabic ? 'شوهد مؤخراً' : 'Recently viewed'}</h2>
        <ListingRows locale={locale} items={recent} empty={isArabic ? 'لا يوجد سجل مشاهدة حديث.' : 'No recent listing views.'} />
      </section>
    </section>
  );
}
