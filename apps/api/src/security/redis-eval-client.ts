import net from 'node:net';
import tls from 'node:tls';
import type { RedisEvalClient } from './redis-rate-limit.js';

export interface RedisUrlEvalClientOptions {
  url: string;
  timeoutMs?: number;
}

type RedisReply = string | number | null | RedisReply[];

interface ParsedReply {
  value: RedisReply;
  nextOffset: number;
}

interface RedisConnectionConfig {
  secure: boolean;
  host: string;
  port: number;
  username?: string;
  password?: string;
  database: number;
}

const defaultRedisPort = 6379;
const defaultTimeoutMs = 2_000;

function encodeCommand(parts: readonly string[]): Buffer {
  const encoded = parts.map((part) => {
    const value = Buffer.from(part, 'utf8');
    return Buffer.concat([
      Buffer.from(`$${value.length}\r\n`, 'ascii'),
      value,
      Buffer.from('\r\n', 'ascii')
    ]);
  });

  return Buffer.concat([
    Buffer.from(`*${parts.length}\r\n`, 'ascii'),
    ...encoded
  ]);
}

function lineEnd(buffer: Buffer, offset: number): number {
  return buffer.indexOf('\r\n', offset, 'ascii');
}

function parseReply(buffer: Buffer, offset = 0): ParsedReply | undefined {
  if (offset >= buffer.length) {
    return undefined;
  }

  const prefix = String.fromCharCode(buffer[offset] ?? 0);
  const end = lineEnd(buffer, offset + 1);
  if (end < 0) {
    return undefined;
  }

  const header = buffer.toString('utf8', offset + 1, end);
  const payloadOffset = end + 2;

  if (prefix === '+') {
    return { value: header, nextOffset: payloadOffset };
  }

  if (prefix === '-') {
    throw new Error(`Redis command failed: ${header}`);
  }

  if (prefix === ':') {
    const value = Number.parseInt(header, 10);
    if (!Number.isSafeInteger(value)) {
      throw new Error('Redis returned an invalid integer reply');
    }
    return { value, nextOffset: payloadOffset };
  }

  if (prefix === '$') {
    const length = Number.parseInt(header, 10);
    if (length === -1) {
      return { value: null, nextOffset: payloadOffset };
    }
    if (!Number.isInteger(length) || length < 0) {
      throw new Error('Redis returned an invalid bulk-string length');
    }
    const bodyEnd = payloadOffset + length;
    if (buffer.length < bodyEnd + 2) {
      return undefined;
    }
    if (buffer.toString('ascii', bodyEnd, bodyEnd + 2) !== '\r\n') {
      throw new Error('Redis returned a malformed bulk string');
    }
    return {
      value: buffer.toString('utf8', payloadOffset, bodyEnd),
      nextOffset: bodyEnd + 2
    };
  }

  if (prefix === '*') {
    const count = Number.parseInt(header, 10);
    if (count === -1) {
      return { value: null, nextOffset: payloadOffset };
    }
    if (!Number.isInteger(count) || count < 0) {
      throw new Error('Redis returned an invalid array length');
    }

    const values: RedisReply[] = [];
    let nextOffset = payloadOffset;
    for (let index = 0; index < count; index += 1) {
      const parsed = parseReply(buffer, nextOffset);
      if (!parsed) {
        return undefined;
      }
      values.push(parsed.value);
      nextOffset = parsed.nextOffset;
    }
    return { value: values, nextOffset };
  }

  throw new Error(`Redis returned an unsupported RESP prefix: ${prefix}`);
}

function parseConnectionConfig(rawUrl: string): RedisConnectionConfig {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('REDIS_URL must be a valid redis:// or rediss:// URL');
  }

  if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') {
    throw new Error('REDIS_URL must use redis:// or rediss://');
  }
  if (!url.hostname) {
    throw new Error('REDIS_URL must include a hostname');
  }

  const port = url.port ? Number.parseInt(url.port, 10) : defaultRedisPort;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('REDIS_URL contains an invalid port');
  }

  const databaseText = url.pathname.replace(/^\//, '');
  const database = databaseText === '' ? 0 : Number.parseInt(databaseText, 10);
  if (!Number.isInteger(database) || database < 0) {
    throw new Error('REDIS_URL database must be a non-negative integer');
  }

  return {
    secure: url.protocol === 'rediss:',
    host: url.hostname,
    port,
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    database
  };
}

function buildCommands(config: RedisConnectionConfig, evalCommand: string[]): string[][] {
  const commands: string[][] = [];
  if (config.password !== undefined) {
    commands.push(config.username
      ? ['AUTH', config.username, config.password]
      : ['AUTH', config.password]);
  }
  if (config.database !== 0) {
    commands.push(['SELECT', String(config.database)]);
  }
  commands.push(evalCommand);
  return commands;
}

export class RedisUrlEvalClient implements RedisEvalClient {
  private readonly config: RedisConnectionConfig;
  private readonly timeoutMs: number;

  constructor(options: RedisUrlEvalClientOptions) {
    this.config = parseConnectionConfig(options.url);
    this.timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 100 || this.timeoutMs > 30_000) {
      throw new Error('Redis timeout must be an integer between 100 and 30000 milliseconds');
    }
  }

  async eval(script: string, keys: string[], args: string[]): Promise<unknown> {
    const command = ['EVAL', script, String(keys.length), ...keys, ...args];
    const commands = buildCommands(this.config, command);
    const payload = Buffer.concat(commands.map((parts) => encodeCommand(parts)));

    return await new Promise<RedisReply>((resolve, reject) => {
      let settled = false;
      let buffer = Buffer.alloc(0);
      let parsedCount = 0;
      let offset = 0;
      let lastReply: RedisReply = null;

      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (error) reject(error);
        else resolve(lastReply);
      };

      const socket = this.config.secure
        ? tls.connect({ host: this.config.host, port: this.config.port, servername: this.config.host })
        : net.connect({ host: this.config.host, port: this.config.port });

      socket.setTimeout(this.timeoutMs);
      socket.once('connect', () => socket.write(payload));
      socket.on('data', (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);
        try {
          while (parsedCount < commands.length) {
            const parsed = parseReply(buffer, offset);
            if (!parsed) break;
            lastReply = parsed.value;
            offset = parsed.nextOffset;
            parsedCount += 1;
          }
          if (parsedCount === commands.length) {
            finish();
          }
        } catch (error) {
          finish(error instanceof Error ? error : new Error('Redis reply parsing failed'));
        }
      });
      socket.once('timeout', () => finish(new Error('Redis command timed out')));
      socket.once('error', (error) => finish(error));
      socket.once('end', () => {
        if (!settled && parsedCount < commands.length) {
          finish(new Error('Redis connection ended before a complete reply was received'));
        }
      });
    });
  }
}

export const redisEvalClientInternals = {
  encodeCommand,
  parseReply,
  parseConnectionConfig
};
