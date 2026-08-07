import { getAuthed, postAuthed, postAuthedBinary } from './authed-api';

export const accountProfilePath = '/v1/account/profile';
export const accountExportPath = '/v1/account/export';
export const accountClosurePath = '/v1/account/closure';

export function loadAccountProfile<T>(): Promise<T> {
  return getAuthed<T>(accountProfilePath);
}

export function saveAccountProfile<T>(input: Record<string, unknown>): Promise<T> {
  return postAuthed<T>(accountProfilePath, input);
}

export async function uploadAccountAvatar(file: Blob): Promise<void> {
  await postAuthedBinary('/v1/account/profile/avatar/upload', file);
}

export async function removeAccountAvatar(): Promise<void> {
  await postAuthed('/v1/account/profile/avatar/delete', {});
}

export function loadAccountExport<T>(): Promise<T> {
  return getAuthed<T>(accountExportPath);
}

export async function submitAccountClosure(input: Record<string, unknown>): Promise<void> {
  await postAuthed(accountClosurePath, input);
}
