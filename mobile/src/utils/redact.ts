/**
 * Log/error redaction utility (Req 11.5 — log hygiene).
 *
 * Ensures token and credential values never appear verbatim in log output or
 * error messages. Use {@link redact} to mask a single secret string,
 * {@link redactObject} to deep-clone an arbitrary value with known sensitive
 * keys masked, and {@link safeLog} as a drop-in for `console.log` that masks
 * arguments before they reach the console.
 */

const REDACTED = '[REDACTED]';

/**
 * Keys whose values are treated as secrets and masked wherever they appear in
 * an object graph. Matching is case-insensitive so header casings like
 * `Authorization` and payload keys like `access_token` are both covered.
 */
const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  'access_token',
  'refresh_token',
  'accesstoken',
  'refreshtoken',
  'token',
  'password',
  'authorization',
  'auth',
  'secret',
  'api_key',
  'apikey',
]);

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase());
}

/**
 * Masks a single secret string, keeping at most the first and last two
 * characters as a hint (e.g. `ab…yz`). Short or empty values are fully masked
 * so no meaningful portion of a small secret leaks.
 */
export function redact(value: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    return REDACTED;
  }
  if (value.length <= 6) {
    return REDACTED;
  }
  const head = value.slice(0, 2);
  const tail = value.slice(-2);
  return `${head}…${tail}`;
}

/**
 * Strips a `Bearer <token>` value down to `Bearer [REDACTED]` and masks any
 * other authorization scheme value entirely.
 */
function redactAuthorization(value: string): string {
  const match = /^\s*(bearer)\s+(.+)$/i.exec(value);
  if (match) {
    return `${match[1]} ${REDACTED}`;
  }
  return REDACTED;
}

/**
 * Deep-clones a value, masking the values of any {@link SENSITIVE_KEYS} found
 * anywhere in the object graph. Non-object values are returned unchanged.
 * Handles arrays, nested objects, and guards against circular references.
 */
export function redactObject<T>(obj: T, seen: WeakSet<object> = new WeakSet()): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (seen.has(obj as object)) {
    return obj;
  }
  seen.add(obj as object);

  if (Array.isArray(obj)) {
    return obj.map((item) => redactObject(item, seen)) as unknown as T;
  }

  const source = obj as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    const val = source[key];
    if (isSensitiveKey(key)) {
      if (typeof val === 'string') {
        result[key] = key.toLowerCase() === 'authorization' ? redactAuthorization(val) : redact(val);
      } else if (val == null) {
        result[key] = val;
      } else {
        result[key] = REDACTED;
      }
    } else if (val !== null && typeof val === 'object') {
      result[key] = redactObject(val, seen);
    } else {
      result[key] = val;
    }
  }
  return result as unknown as T;
}

/**
 * Strips secret material from a free-form string before it is logged or
 * surfaced in an error message. Removes inline `Bearer <token>` values so a
 * leaked authorization header or token-bearing message never exposes the
 * secret verbatim (Req 11.5).
 */
export function redactMessage(message: string): string {
  if (typeof message !== 'string') {
    return message;
  }
  return message.replace(/(bearer)\s+[A-Za-z0-9._~+/-]+=*/gi, `$1 ${REDACTED}`);
}

/**
 * Masks an arbitrary log argument: strings have any inline `Bearer` tokens
 * stripped, objects are deep-redacted, and other primitives pass through.
 */
function redactArg(arg: unknown): unknown {
  if (typeof arg === 'string') {
    return redactMessage(arg);
  }
  if (arg !== null && typeof arg === 'object') {
    return redactObject(arg);
  }
  return arg;
}

/**
 * Drop-in replacement for `console.log` that redacts known secrets from its
 * arguments before writing to the console.
 */
export function safeLog(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.log(...args.map(redactArg));
}

/**
 * Like {@link safeLog} but routes to `console.error` for error-path logging.
 */
export function safeError(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.error(...args.map(redactArg));
}
