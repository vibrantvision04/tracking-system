/**
 * Storage key constants for on-device persistence.
 *
 * Kept in a dependency-free module so both the API client (`api.ts`) and the
 * secure-storage wrapper (`secureStorage.ts`) can import them without creating
 * a circular import (`api.ts` consumes `secureStorage`, and `secureStorage`
 * needs the key names).
 *
 * `api.ts` re-exports `KEYS` for backward compatibility, so existing
 * `import { KEYS } from '../services/api'` consumers continue to work.
 */
export const KEYS = {
  ACCESS_TOKEN: 'iswm_access_token',
  REFRESH_TOKEN: 'iswm_refresh_token',
  USER_PROFILE: 'iswm_user_profile',
} as const;
