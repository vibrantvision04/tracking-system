import { useEffect, useState } from 'react';
import { useNetwork } from './useNetwork';
import { rfidLocalStore } from '../services/rfidLocalStore';
import { api } from '../services/api';
import { Platform } from 'react-native';

export function useRFIDSync() {
  const isConnected = useNetwork();
  const [syncing, setSyncing] = useState(false);

  const performSync = async () => {
    if (syncing || !isConnected) return;
    setSyncing(true);

    try {
      const queue = await rfidLocalStore.getQueue();
      if (queue.length === 0) {
        setSyncing(false);
        return;
      }

      // Read device ID
      const deviceId = Platform.OS + '-' + (Platform.Version || 'unknown');

      // POST to sync endpoint
      const response = await api.post('/rfid/sync', {
        device_id: deviceId,
        queue: queue.map(item => ({
          local_uuid: item.local_uuid,
          action_type: item.action_type,
          payload: item.payload,
          created_at_device: item.created_at_device,
        })),
      });

      if (response.data && Array.isArray(response.data)) {
        const syncedUuids = response.data
          .filter((res: any) => res.synced)
          .map((res: any) => res.local_uuid);

        if (syncedUuids.length > 0) {
          await rfidLocalStore.clearProcessed(syncedUuids);
        }
      }
    } catch (e) {
      console.error('RFID sync failed', e);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (isConnected) {
      performSync();
    }
  }, [isConnected]);

  return { syncing, performSync };
}
