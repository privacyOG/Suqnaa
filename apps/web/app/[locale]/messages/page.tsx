import { notFound } from 'next/navigation';
import { ConversationInboxPanel } from '../../../components/conversation-inbox-panel';
import { SessionRefresh } from '../../../components/session-refresh';
import { isLocale } from '../../../i18n/locales';
import { loadAccountSessionState } from '../../../lib/account-session-state';

export default async function MessagesPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) {
    notFound();
  }

  const isArabic = params.locale === 'ar';
  const { user, needsRotation } = await loadAccountSessionState();

  return (
    <main className="page-shell messages-page">
      <nav className="top-nav">
        <a className="brand-word" href={`/${params.locale}`}>Suqnaa · سوقنا</a>
        <div className="nav-links">
          <a href={`/${params.locale}/sell/manage`}>{isArabic ? 'إعلاناتي' : 'My listings'}</a>
          <a href={`/${params.locale}/account`}>{isArabic ? 'الحساب' : 'Account'}</a>
        </div>
      </nav>

      <header className="messages-page-header">
        <div>
          <div className="eyebrow">{isArabic ? 'الرسائل' : 'Messages'}</div>
          <h1>{isArabic ? 'محادثاتك في مكان واحد' : 'Your marketplace conversations'}</h1>
          <p>
            {isArabic
              ? 'تابع رسائل المشترين والبائعين، وشاهد المحادثات غير المقروءة بأمان.'
              : 'Keep up with buyers and sellers and review unread conversations securely.'}
          </p>
        </div>
        {user ? (
          <div className="seller-identity-card">
            <span>{isArabic ? 'الحساب' : 'Account'}</span>
            <strong>{user.display_name}</strong>
            <small>{isArabic ? `الحالة: ${user.status}` : `Status: ${user.status}`}</small>
          </div>
        ) : null}
      </header>

      {user ? (
        <ConversationInboxPanel
          locale={params.locale}
          currentUserId={user.id}
        />
      ) : needsRotation ? (
        <div className="seller-session-panel">
          <SessionRefresh locale={params.locale} />
        </div>
      ) : (
        <div className="signed-out-panel seller-session-panel">
          <p className="auth-error">
            {isArabic
              ? 'سجّل الدخول لعرض محادثاتك.'
              : 'Sign in to view your conversations.'}
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
    </main>
  );
}
