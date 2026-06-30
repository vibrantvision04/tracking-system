import { redact, redactObject, redactMessage, safeLog, safeError } from '../../src/utils/redact';

describe('redact', () => {
  it('masks a long secret keeping first/last two chars', () => {
    expect(redact('abcdefghij')).toBe('ab…ij');
  });

  it('fully masks short secrets', () => {
    expect(redact('abc')).toBe('[REDACTED]');
    expect(redact('abcdef')).toBe('[REDACTED]');
  });

  it('fully masks empty/non-string values', () => {
    expect(redact('')).toBe('[REDACTED]');
    // @ts-expect-error testing defensive runtime behavior
    expect(redact(undefined)).toBe('[REDACTED]');
  });
});

describe('redactObject', () => {
  it('masks known sensitive keys at the top level', () => {
    const out = redactObject({
      access_token: 'aaaaaaaaaaaa',
      refresh_token: 'bbbbbbbbbbbb',
      password: 'supersecretpw',
      token: 'tttttttttttt',
      username: 'alice',
    });
    expect(out.access_token).toBe('aa…aa');
    expect(out.refresh_token).toBe('bb…bb');
    expect(out.password).toBe('su…pw');
    expect(out.token).toBe('tt…tt');
    expect(out.username).toBe('alice');
  });

  it('masks Authorization header preserving the Bearer scheme', () => {
    const out = redactObject({
      headers: { Authorization: 'Bearer abcdefghijklmnop' },
    });
    expect(out.headers.Authorization).toBe('Bearer [REDACTED]');
  });

  it('masks sensitive keys case-insensitively and nested in arrays', () => {
    const out = redactObject({
      items: [{ Token: 'zzzzzzzzzzzz' }, { safe: 'value' }],
    });
    expect(out.items[0].Token).toBe('zz…zz');
    expect(out.items[1].safe).toBe('value');
  });

  it('does not mutate the original object', () => {
    const original = { password: 'plaintextsecret' };
    const out = redactObject(original);
    expect(original.password).toBe('plaintextsecret');
    expect(out.password).not.toBe('plaintextsecret');
  });

  it('handles circular references without throwing', () => {
    const obj: any = { password: 'circularsecret' };
    obj.self = obj;
    expect(() => redactObject(obj)).not.toThrow();
  });

  it('returns non-object values unchanged', () => {
    expect(redactObject(42 as unknown as number)).toBe(42);
    expect(redactObject(null as unknown as null)).toBeNull();
  });
});

describe('redactMessage', () => {
  it('strips inline Bearer tokens from a message', () => {
    const msg = 'Request failed with Authorization: Bearer abc123.def456-ghi';
    expect(redactMessage(msg)).toBe('Request failed with Authorization: Bearer [REDACTED]');
  });

  it('leaves messages without secrets unchanged', () => {
    expect(redactMessage('Request timed out')).toBe('Request timed out');
  });
});

describe('safeLog/safeError', () => {
  it('redacts object arguments before logging', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    safeLog('login response', { access_token: 'aaaaaaaaaaaa' });
    expect(spy).toHaveBeenCalledWith('login response', { access_token: 'aa…aa' });
    spy.mockRestore();
  });

  it('redacts inline bearer tokens in string args via console.error', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    safeError('failed: Bearer abcdef123456');
    expect(spy).toHaveBeenCalledWith('failed: Bearer [REDACTED]');
    spy.mockRestore();
  });
});
