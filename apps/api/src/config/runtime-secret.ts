import { readFileSync } from 'node:fs';

export interface RuntimeSecretInput {
  name: string;
  value?: string;
  file?: string;
}

export function resolveRuntimeSecret(input: RuntimeSecretInput): string {
  const inlineValue = input.value?.trim() ?? '';
  const filePath = input.file?.trim() ?? '';

  if (inlineValue && filePath) {
    throw new Error(`${input.name} must be configured by value or file, not both`);
  }

  if (filePath) {
    let value: string;
    try {
      value = readFileSync(filePath, 'utf8').trim();
    } catch {
      throw new Error(`${input.name} secret file is not readable`);
    }

    if (!value) {
      throw new Error(`${input.name} secret file is empty`);
    }

    return value;
  }

  return inlineValue;
}
