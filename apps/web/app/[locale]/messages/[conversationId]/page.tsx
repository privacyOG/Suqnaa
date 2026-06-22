import { notFound } from 'next/navigation';
import { ConversationThreadPanel } from '../../../../components/conversation-thread-panel';
import { SessionRefresh } from '../../../../components/session-refresh';
import { isLocale } from '../../../../i18n/locales';
import { loadAccountSessionState } from '../../../../lib/account-session-state';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function ConversationPage({
  params
}: {
  params: { locale: string; conversationId: string };
}) {
  if (!isLocale(params.locale) || !uuidPattern.test(params.conversationId)) {
    notFound();
  }

  const isArabic = params.locale === 'ar';
  const { user, needsRotation } = await loadAccountSessionState();

  return (
    <main className="page-shell messages-page">
      <nav className="top-nav">
        <a className="brand-word" href={`/${params.locale}`}>Suqnaa · سوقنا</a>
        <div className="nav-links">
          <a href={`/${params.locale}/messages`}>{isArabic ? 'المحادثات' : 'Messages'}</a>
          <a href={`/${params.locale}/account`}>{isArabic ? 'الحساب' : 'Account'}</a>
        </div>
      </nav>

      {user ? (
        <ConversationThreadPanel
          locale={params.locale}
          currentUserId={user.id}
          conversationId={params.conversationId}
        />
      ) : needsRotation ? (
        <div className="seller-session-panel">
          <SessionRefresh locale={params.locale} />
        </div>
      ) : (
        <div className="signed-out-panel seller-session-panel">
          <p className="auth-error">
            {isArabic
              ? 'سجّل الدخول لفتح هذه المحادثة.'
              : 'Sign in to open this conversation.'}
          </p>
          <div className="actions">
            <a className="button-primary" href={`/${params.locale}/account/sign-in`}>
              {isArabic ? 'تسجيل الدخول' : 'Sign in'}
            </a>
            <a className="button-secondary" href={`/${params.locale}/messages`}>
              {isArabic ? 'العودة' : 'Back'}
            </a>
          </div>
        </div>
      )}
    </main>
  );
}
