import AsyncStorage from '@react-native-async-storage/async-storage';

export interface OfflineSyncItem {
  local_uuid: string;
  action_type: 'registration' | 'coverage' | 'payment' | 'scan_log';
  payload: any;
  created_at_device: string;
}

const STORAGE_KEY = '@rfid_offline_sync_queue';

export const rfidLocalStore = {
  async getQueue(): Promise<OfflineSyncItem[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Failed to load RFID sync queue', e);
      return [];
    }
  },

  async addToQueue(item: Omit<OfflineSyncItem, 'local_uuid' | 'created_at_device'>): Promise<string> {
    const local_uuid = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const created_at_device = new Date().toISOString();
    const newItem: OfflineSyncItem = {
      ...item,
      local_uuid,
      created_at_device,
    };

    try {
      const queue = await this.getQueue();
      queue.push(newItem);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
      return local_uuid;
    } catch (e) {
      console.error('Failed to add item to RFID sync queue', e);
      throw e;
    }
  },

  async clearProcessed(localUuids: string[]): Promise<void> {
    try {
      const queue = await this.getQueue();
      const filtered = queue.filter(item => !localUuids.includes(item.local_uuid));
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    } catch (e) {
      console.error('Failed to clear processed items from queue', e);
    }
  },
};
