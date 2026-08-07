import { getAuthed, postAuthed, type JsonBody } from './authed-api';

export interface AdministrativeAccessResponse {
  userId: string;
  roles: Array<{
    assignmentId: string;
    key: string;
    name: string;
    grantedAt: string;
  }>;
  permissions: string[];
}

export interface AdministrativeRole {
  key: string;
  name: string;
  description: string;
  system: boolean;
  permissions: string[];
}

export interface AdministrativeAssignment {
  id: string;
  userId: string;
  displayName: string;
  email: string | null;
  phoneE164: string | null;
  accountStatus: string;
  roleKey: string;
  roleName: string;
  grantedBy: string;
  grantedAt: string;
}

export interface AdministrativeRoleMutationInput extends JsonBody {
  roleKey: string;
  reason?: string;
}

export function getAdministrativeAccess(): Promise<AdministrativeAccessResponse> {
  return getAuthed('/v1/operations/access/me');
}

export function getAdministrativeRoles(): Promise<{ roles: AdministrativeRole[] }> {
  return getAuthed('/v1/operations/access/roles');
}

export function getAdministrativeAssignments(): Promise<{ assignments: AdministrativeAssignment[] }> {
  return getAuthed('/v1/operations/access/assignments');
}

export function grantAdministrativeRole(userId: string, input: AdministrativeRoleMutationInput) {
  return postAuthed(`/v1/operations/access/users/${userId}/grant`, input);
}

export function revokeAdministrativeRole(userId: string, input: AdministrativeRoleMutationInput) {
  return postAuthed(`/v1/operations/access/users/${userId}/revoke`, input);
}
