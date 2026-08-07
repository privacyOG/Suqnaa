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

export interface AdministrativeRoleMutationResponse {
  assignment: {
    assignmentId: string;
    roleKey: string;
    grantedAt?: string;
    revokedAt?: string;
  };
}

export function getAdministrativeAccess(): Promise<AdministrativeAccessResponse> {
  return getAuthed<AdministrativeAccessResponse>('/v1/operations/access/me');
}

export function getAdministrativeRoles(): Promise<{ roles: AdministrativeRole[] }> {
  return getAuthed<{ roles: AdministrativeRole[] }>('/v1/operations/access/roles');
}

export function getAdministrativeAssignments(): Promise<{ assignments: AdministrativeAssignment[] }> {
  return getAuthed<{ assignments: AdministrativeAssignment[] }>('/v1/operations/access/assignments');
}

export function grantAdministrativeRole(
  userId: string,
  input: AdministrativeRoleMutationInput
): Promise<AdministrativeRoleMutationResponse> {
  return postAuthed<AdministrativeRoleMutationResponse>(`/v1/operations/access/users/${userId}/grant`, input);
}

export function revokeAdministrativeRole(
  userId: string,
  input: AdministrativeRoleMutationInput
): Promise<AdministrativeRoleMutationResponse> {
  return postAuthed<AdministrativeRoleMutationResponse>(`/v1/operations/access/users/${userId}/revoke`, input);
}
