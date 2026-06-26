import React, { createContext, useContext, useMemo } from 'react';
import { useOfflineStatus } from '../components/OfflineBanner';

interface OfflineContextValue {
  /** Whether the device is currently offline (includes 3s reconnection grace period) */
  isOffline: boolean;
  /** Style opacity value to apply to network-dependent elements when offline */
  networkDependentOpacity: number;
}

const OfflineContext = createContext<OfflineContextValue>({
  isOffline: false,
  networkDependentOpacity: 1,
});

const DIMMED_OPACITY = 0.5;

/**
 * Provider that exposes offline status to the entire component tree.
 * Wrap around the navigation hierarchy so any screen can access
 * the offline state via `useOffline()`.
 */
export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const isOffline = useOfflineStatus();

  const value = useMemo<OfflineContextValue>(
    () => ({
      isOffline,
      networkDependentOpacity: isOffline ? DIMMED_OPACITY : 1,
    }),
    [isOffline],
  );

  return (
    <OfflineContext.Provider value={value}>
      {children}
    </OfflineContext.Provider>
  );
}

/**
 * Hook to access offline state from any component in the tree.
 *
 * Returns:
 * - `isOffline`: boolean indicating whether the device should be considered offline
 * - `networkDependentOpacity`: 0.5 when offline, 1 when online — apply to
 *   network-dependent action buttons to dim them per Requirement 13.2
 *
 * Usage:
 * ```tsx
 * const { isOffline, networkDependentOpacity } = useOffline();
 * <Button style={{ opacity: networkDependentOpacity }} disabled={isOffline} ... />
 * ```
 */
export function useOffline(): OfflineContextValue {
  return useContext(OfflineContext);
}
