'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  getAdministrativeAccess,
  getAdministrativeAssignments,
  getAdministrativeRoles,
  grantAdministrativeRole,
  revokeAdministrativeRole,
  type AdministrativeAccessResponse,
  type AdministrativeAssignment,
  type AdministrativeRole
} from '../lib/operations-access-api';

export function OperationsAccessPanel({ locale }: { locale: string }) {
  const isArabic = locale === 'ar';
  const [access, setAccess] = useState<AdministrativeAccessResponse | null>(null);
  const [roles, setRoles] = useState<AdministrativeRole[]>([]);
  const [assignments, setAssignments] = useState<AdministrativeAssignment[]>([]);
  const [targetUserId, setTargetUserId] = useState('');
  const [roleKey, setRoleKey] = useState('trust_reviewer');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const canReadRoles = access?.permissions.includes('roles.read') ?? false;
  const canManageRoles = access?.permissions.includes('roles.manage') ?? false;

  async function load() {
    setMessage('');
    const own = await getAdministrativeAccess();
    setAccess(own);
    if (own.permissions.includes('roles.read')) {
      const [roleResponse, assignmentResponse] = await Promise.all([
        getAdministrativeRoles(),
        getAdministrativeAssignments()
      ]);
      setRoles(roleResponse.roles);
      setAssignments(assignmentResponse.assignments);
      if (roleResponse.roles.length && !roleResponse.roles.some((role) => role.key === roleKey)) {
        setRoleKey(roleResponse.roles[0].key);
      }
    }
  }

  useEffect(() => {
    load().catch(() => setMessage(isArabic ? 'تعذر تحميل صلاحيات الإدارة.' : 'Unable to load administrative access.'));
  }, []);

  const groupedAssignments = useMemo(() => {
    const groups = new Map<string, AdministrativeAssignment[]>();
    for (const assignment of assignments) {
      const current = groups.get(assignment.userId) ?? [];
      current.push(assignment);
      groups.set(assignment.userId, current);
    }
    return [...groups.entries()];
  }, [assignments]);

  async function mutate(action: 'grant' | 'revoke') {
    if (!targetUserId.trim() || !roleKey) return;
    setBusy(true);
    setMessage('');
    try {
      if (action === 'grant') {
        await grantAdministrativeRole(targetUserId.trim(), { roleKey });
        setMessage(isArabic ? 'تم منح الدور.' : 'Role granted.');
      } else {
        await revokeAdministrativeRole(targetUserId.trim(), {
          roleKey,
          ...(reason.trim() ? { reason: reason.trim() } : {})
        });
        setMessage(isArabic ? 'تم سحب الدور مع الاحتفاظ بسجل التغيير.' : 'Role revoked and retained in the audit history.');
      }
      setReason('');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : (isArabic ? 'فشل تغيير الدور.' : 'Role change failed.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="catalog-section">
      <div className="section-heading">
        <div>
          <span className="buyer-action-label">{isArabic ? 'صلاحيات' : 'Access control'}</span>
          <h2>{isArabic ? 'الأدوار والصلاحيات الإدارية' : 'Administrative roles and permissions'}</h2>
        </div>
      </div>

      {message ? <p className="form-status">{message}</p> : null}

      <div className="detail-card">
        <h3>{isArabic ? 'صلاحياتي الحالية' : 'My current access'}</h3>
        <p>{access?.roles.map((role) => role.name).join(', ') || (isArabic ? 'لا توجد أدوار' : 'No roles')}</p>
        <p className="muted-copy">{access?.permissions.join(' · ') || ''}</p>
      </div>

      {canManageRoles ? (
        <div className="detail-card">
          <h3>{isArabic ? 'تغيير دور مستخدم' : 'Change a user role'}</h3>
          <p className="muted-copy">
            {isArabic
              ? 'يجب استخدام معرف المستخدم الكامل. لا يمكن تغيير أدوارك بنفسك أو منح صلاحيات لا تملكها.'
              : 'Use the exact user UUID. You cannot change your own roles or grant privileges you do not hold.'}
          </p>
          <label>
            {isArabic ? 'معرف المستخدم' : 'User UUID'}
            <input value={targetUserId} onChange={(event) => setTargetUserId(event.target.value)} placeholder="00000000-0000-0000-0000-000000000000" />
          </label>
          <label>
            {isArabic ? 'الدور' : 'Role'}
            <select value={roleKey} onChange={(event) => setRoleKey(event.target.value)}>
              {roles.map((role) => <option key={role.key} value={role.key}>{role.name}</option>)}
            </select>
          </label>
          <label>
            {isArabic ? 'سبب السحب (اختياري)' : 'Revocation reason (optional)'}
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} />
          </label>
          <div className="actions">
            <button className="button-primary" disabled={busy || !targetUserId.trim()} onClick={() => mutate('grant')}>
              {isArabic ? 'منح الدور' : 'Grant role'}
            </button>
            <button className="button-secondary" disabled={busy || !targetUserId.trim()} onClick={() => mutate('revoke')}>
              {isArabic ? 'سحب الدور' : 'Revoke role'}
            </button>
          </div>
        </div>
      ) : null}

      {canReadRoles ? (
        <>
          <div className="detail-card">
            <h3>{isArabic ? 'كتالوج الأدوار' : 'Role catalogue'}</h3>
            {roles.map((role) => (
              <div key={role.key} className="detail-row">
                <strong>{role.name}</strong>
                <span>{role.key}</span>
                <p>{role.description}</p>
                <p className="muted-copy">{role.permissions.join(' · ')}</p>
              </div>
            ))}
          </div>

          <div className="detail-card">
            <h3>{isArabic ? 'التعيينات النشطة' : 'Active assignments'}</h3>
            {groupedAssignments.length === 0 ? <p>{isArabic ? 'لا توجد تعيينات.' : 'No active assignments.'}</p> : null}
            {groupedAssignments.map(([userId, userAssignments]) => (
              <div key={userId} className="detail-row">
                <strong>{userAssignments[0]?.displayName}</strong>
                <span>{userId}</span>
                <p>{userAssignments.map((assignment) => assignment.roleName).join(', ')}</p>
                <p className="muted-copy">
                  {userAssignments[0]?.email ?? userAssignments[0]?.phoneE164 ?? (isArabic ? 'لا يوجد اتصال' : 'No contact')}
                </p>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
