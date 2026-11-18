import Dexie, { type EntityTable } from 'dexie';

// Match this interface to your Kotlin data class
export interface SyncItem {
  id: string; // UUID from Android
  title: string;
  category: string;
  lastUpdated: number; // Epoch timestamp for conflict resolution
  barcode?: string | null;
  expiryDateEpoch?: number | null;
  quantity?: number;
  rawJsonDetails?: string | null;
  isAvailable?: boolean;
  isOnBuyList?: boolean;
  openedDateEpoch?: number | null;
  boughtDateEpoch?: number | null;
}

const db = new Dexie('CompanionAppDB') as Dexie & {
  items: EntityTable<SyncItem, 'id'>;
};

// Declare tables and indexed fields
db.version(1).stores({
  items: 'id, category, lastUpdated',
});

export { db };
