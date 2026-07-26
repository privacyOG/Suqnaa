import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const fromPoints = (points) => String.fromCodePoint(...points);
const allowedAuthor = 'privacyOG';

const restrictedFragments = [
  [97, 115, 115, 105, 115, 116, 97, 110, 116],
  [99, 104, 97, 116, 103, 112, 116],
  [111, 112, 101, 110, 97, 105],
  [99, 108, 97, 117, 100, 101],
  [97, 110, 116, 104, 114, 111, 112, 105, 99],
  [103, 101, 109, 105, 110, 105],
  [99, 111, 112, 105, 108, 111, 116],
  [113, 119, 101, 110],
  [109, 105, 115, 116, 114, 97, 108],
  [108, 108, 97, 109, 97],
  [100, 101, 101, 112, 115, 101, 101, 107],
  [111, 108, 108, 97, 109, 97],
  [104, 117, 103, 103, 105, 110, 103, 102, 97, 99, 101],
  [108, 97, 110, 103, 117, 97, 103, 101, 32, 109, 111, 100, 101, 108],
  [108, 97, 114, 103, 101, 32, 108, 97, 110, 103, 117, 97, 103, 101, 32, 109, 111, 100, 101, 108],
  [103, 101, 110, 101, 114, 97, 116, 105, 118, 101, 32, 97, 105],
  [97, 114, 116, 105, 102, 105, 99, 105, 97, 108, 32, 105, 110, 116, 101, 108, 108, 105, 103, 101, 110, 99, 101]
].map(fromPoints);

const restrictedWords = [
  [103, 112, 116],
  [108, 108, 109]
].map(fromPoints);

const coAuthorMarker = fromPoints([99, 111, 45, 97, 117, 116, 104, 111, 114, 101, 100, 45, 98, 121, 58]);
const authoredByMarker = fromPoints([97, 117, 116, 104, 111, 114, 101, 100, 32, 98, 121]);
const generatedByMarker = fromPoints([103, 101, 110, 101, 114, 97, 116, 101, 100, 32, 98, 121]);
const automatedAuthorMarker = fromPoints([97, 117, 116, 111, 109, 97, 116, 101, 100, 32, 97, 117, 116, 104, 111, 114]);

function gitRaw(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function git(args) {
  return gitRaw(args).trim();
}

function resolveCommit(value) {
  if (!value || /^0+$/.test(value)) {
    return null;
  }

  try {
    return git(['rev-parse', '--verify', `${value}^{commit}`]);
  } catch {
    return null;
  }
}

function containsRestrictedText(value) {
  const normalized = value.toLowerCase();
  if (restrictedFragments.some((entry) => normalized.includes(entry))) {
    return true;
  }

  return restrictedWords.some((entry) => {
    const expression = new RegExp(`(^|[^a-z0-9])${entry}([^a-z0-9]|$)`, 'i');
    return expression.test(normalized);
  });
}

function inspectTrackedFiles(failures) {
  const files = gitRaw(['ls-files', '-z']).split('\0').filter(Boolean);

  for (const path of files) {
    if (containsRestrictedText(path)) {
      failures.push(`${path}: restricted path marker`);
    }

    let buffer;
    try {
      buffer = readFileSync(path);
    } catch (error) {
      failures.push(`${path}: could not read tracked file (${error.message})`);
      continue;
    }

    if (buffer.includes(0)) {
      continue;
    }

    const text = buffer.toString('utf8');
    const normalized = text.toLowerCase();

    if (containsRestrictedText(text)) {
      failures.push(`${path}: restricted content marker`);
    }

    if (normalized.includes(coAuthorMarker)) {
      failures.push(`${path}: co-author attribution is not permitted`);
    }

    for (const line of text.split(/\r?\n/)) {
      const normalizedLine = line.toLowerCase();
      const attributionLine = normalizedLine.includes(authoredByMarker)
        || normalizedLine.includes(generatedByMarker)
        || normalizedLine.includes(automatedAuthorMarker)
        || /^\s*(?:"?author"?|authors?)\s*[:=]/i.test(line);

      if (attributionLine && !normalizedLine.includes(allowedAuthor.toLowerCase())) {
        failures.push(`${path}: attribution must use ${allowedAuthor}`);
      }
    }
  }
}

function inspectCommits(failures) {
  const head = resolveCommit(process.env.POLICY_HEAD_SHA) ?? resolveCommit('HEAD');
  if (!head) {
    failures.push('Unable to resolve the policy head commit');
    return;
  }

  const base = resolveCommit(process.env.POLICY_BASE_SHA)
    ?? resolveCommit(process.env.POLICY_BASE_REF);

  let revision = head;
  if (base && base !== head) {
    revision = `${base}..${head}`;
  } else {
    const parent = resolveCommit(`${head}^`);
    if (parent) {
      revision = `${parent}..${head}`;
    }
  }

  const records = gitRaw([
    'log',
    '--format=%H%x1f%an%x1f%B%x1e',
    revision
  ]).split('\x1e').map((entry) => entry.trim()).filter(Boolean);

  for (const record of records) {
    const [sha, authorName, ...messageParts] = record.split('\x1f');
    const message = messageParts.join('\x1f');

    if (authorName !== allowedAuthor) {
      failures.push(`${sha}: commit author must be ${allowedAuthor}`);
    }
    if (containsRestrictedText(message)) {
      failures.push(`${sha}: restricted commit-message marker`);
    }
    if (message.toLowerCase().includes(coAuthorMarker)) {
      failures.push(`${sha}: co-author trailers are not permitted`);
    }
  }
}

const failures = [];
inspectTrackedFiles(failures);
inspectCommits(failures);

if (failures.length > 0) {
  console.error('Repository policy failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Repository policy passed for ${allowedAuthor}.`);
