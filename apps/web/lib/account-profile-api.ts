import { getAuthed, postAuthed, postAuthedBinary } from './authed-api';

export interface AccountProfilePayload {
  user: {
    id: string;
    email: string | null;
    phoneE164: string | null;
    displayName: string;
    status: string;
  };
  profile: {
    bio: string | null;
    city: string | null;
    countryCode: string | null;
    isBusiness: boolean;
    businessName: string | null;
    businessDescription: string | null;
    businessWebsite: string | null;
    profileVisibility: 'public' | 'private';
    showCity: boolean;
    showCountry: boolean;
    showBusinessDetails: boolean;
    showAvatar: boolean;
    hasAvatar: boolean;
    avatarUrl: string | null;
    avatarMimeType: string | null;
    avatarSizeBytes: number | null;
  };
}

export interface AccountProfileUpdate extends Record<string, unknown> {
  displayName: string;
  bio: string | null;
  city: string | null;
  countryCode: string | null;
  isBusiness: boolean;
  businessName: string | null;
  businessDescription: string | null;
  businessWebsite: string | null;
  profileVisibility: 'public' | 'private';
  showCity: boolean;
  showCountry: boolean;
  showBusinessDetails: boolean;
  showAvatar: boolean;
}

export interface AccountClosureInput extends Record<string, unknown> {
  currentPassword: string;
  mode: 'close' | 'delete';
  acknowledgement: string;
}

export const accountProfilePath = '/v1/account/profile';
export const accountExportPath = '/v1/account/export';
export const accountClosurePath = '/v1/account/closure';

export function loadAccountProfile(): Promise<AccountProfilePayload> {
  return getAuthed<AccountProfilePayload>(accountProfilePath);
}

export function saveAccountProfile(input: AccountProfileUpdate): Promise<AccountProfilePayload> {
  return postAuthed<AccountProfilePayload>(accountProfilePath, input);
}

export async function uploadAccountAvatar(file: Blob): Promise<void> {
  await postAuthedBinary('/v1/account/profile/avatar/upload', file);
}

export async function removeAccountAvatar(): Promise<void> {
  await postAuthed('/v1/account/profile/avatar/delete', {});
}

export function loadAccountExport(): Promise<Record<string, unknown>> {
  return getAuthed<Record<string, unknown>>(accountExportPath);
}

export async function submitAccountClosure(input: AccountClosureInput): Promise<void> {
  await postAuthed(accountClosurePath, input);
}
