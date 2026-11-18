'use client';

import { SyncModal } from '@/components/SyncModal';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type SyncItem } from '@/lib/db';
import {
  CircleCheck,
  Download,
  Leaf,
  MonitorDown,
  PackageCheck,
  Plus,
  RotateCcw,
  Search,
  Share,
  Settings,
  ShoppingBasket,
  Smartphone,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

type InventorySection = 'available' | 'finished' | 'buy';

const categories = [
  { value: 'ALL', label: 'All categories' },
  { value: 'FRESH_FOOD', label: 'Fresh Food' },
  { value: 'GROCERY', label: 'Groceries' },
  { value: 'MEDICINE', label: 'Medicine' },
  { value: 'BABY_CARE', label: 'Baby Care' },
  { value: 'OTHERS', label: 'Others' },
  { value: 'General', label: 'General' },
];

const categoryLabels = new Map(categories.map(({ value, label }) => [value.toLowerCase(), label]));

function categoryName(category: string) {
  return categoryLabels.get(category.toLowerCase()) ?? category;
}

function daysUntil(epoch: number, now: number) {
  return Math.round((epoch - now) / 86_400_000);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseBackup(value: unknown): SyncItem[] {
  if (!isRecord(value) || value.format !== 'freshkeep-backup' || value.version !== 1 || !Array.isArray(value.items)) {
    throw new Error('This is not a supported FreshKeep backup file.');
  }

  const seenIds = new Set<string>();
  return value.items.map((candidate, index) => {
    if (!isRecord(candidate)) throw new Error(`Item ${index + 1} is invalid.`);
    const {
      id, title, category, lastUpdated, barcode, expiryDateEpoch, quantity, rawJsonDetails,
      isAvailable, isOnBuyList, openedDateEpoch, boughtDateEpoch,
    } = candidate;
    if (typeof id !== 'string' || !id || seenIds.has(id) || typeof title !== 'string' || !title.trim()
      || typeof category !== 'string' || !category || typeof lastUpdated !== 'number' || !Number.isFinite(lastUpdated)) {
      throw new Error(`Item ${index + 1} is missing required data or has a duplicate ID.`);
    }
    if ((expiryDateEpoch !== undefined && expiryDateEpoch !== null && (typeof expiryDateEpoch !== 'number' || !Number.isFinite(expiryDateEpoch)))
      || (barcode !== undefined && barcode !== null && typeof barcode !== 'string')
      || (quantity !== undefined && (typeof quantity !== 'number' || !Number.isFinite(quantity)))
      || (rawJsonDetails !== undefined && rawJsonDetails !== null && typeof rawJsonDetails !== 'string')
      || (isAvailable !== undefined && typeof isAvailable !== 'boolean')
      || (isOnBuyList !== undefined && typeof isOnBuyList !== 'boolean')
      || (openedDateEpoch !== undefined && openedDateEpoch !== null && (typeof openedDateEpoch !== 'number' || !Number.isFinite(openedDateEpoch)))
      || (boughtDateEpoch !== undefined && boughtDateEpoch !== null && (typeof boughtDateEpoch !== 'number' || !Number.isFinite(boughtDateEpoch)))) {
      throw new Error(`Item ${index + 1} contains invalid field values.`);
    }

    seenIds.add(id);
    return {
      id, title, category, lastUpdated, barcode, expiryDateEpoch, quantity, rawJsonDetails,
      isAvailable, isOnBuyList, openedDateEpoch, boughtDateEpoch,
    };
  });
}

export default function Home() {
  const items = useLiveQuery(() => db.items.orderBy('lastUpdated').reverse().toArray(), []) ?? [];
  const [title, setTitle] = useState('');
  const [isSyncOpen, setIsSyncOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [backupMessage, setBackupMessage] = useState('');
  const backupFileInputRef = useRef<HTMLInputElement>(null);
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [section, setSection] = useState<InventorySection>('available');
  const [search, setSearch] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCategory, setNewCategory] = useState('OTHERS');
  const [expiryDays, setExpiryDays] = useState('14');
  const [buyListTitle, setBuyListTitle] = useState('');
  const [now, setNow] = useState(0);
  const [installPlatform, setInstallPlatform] = useState<'ios' | 'windows' | null>(null);

  useEffect(() => {
    setNow(Date.now());

    const userAgent = navigator.userAgent.toLowerCase();
    const isAppleTouchDevice = /iphone|ipad|ipod/.test(userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isWindows = /windows/.test(userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    setInstallPlatform(isStandalone ? null : isAppleTouchDevice ? 'ios' : isWindows ? 'windows' : null);

    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      navigator.storage.persist()
        .then((granted) => {
          console.log(`Persistent storage granted: ${granted}`);
        })
        .catch((error: unknown) => {
          console.warn('Could not request persistent storage:', error);
        });
    }
  }, []);

  const matchingItems = useMemo(() => items.filter((item) => {
    const matchesSearch = item.title.toLowerCase().includes(search.trim().toLowerCase());
    const matchesCategory = selectedCategory === 'ALL' || item.category.toLowerCase() === selectedCategory.toLowerCase();
    return matchesSearch && matchesCategory;
  }), [items, search, selectedCategory]);

  const availableItems = matchingItems
    .filter((item) => !item.isOnBuyList && item.isAvailable !== false && (!item.expiryDateEpoch || item.expiryDateEpoch >= now))
    .sort((a, b) => (a.expiryDateEpoch ?? Number.MAX_SAFE_INTEGER) - (b.expiryDateEpoch ?? Number.MAX_SAFE_INTEGER));
  const finishedItems = matchingItems.filter((item) => !item.isOnBuyList && (item.isAvailable === false || (item.expiryDateEpoch != null && item.expiryDateEpoch < now)));
  const buyListItems = matchingItems.filter((item) => item.isOnBuyList === true);
  const sections: { id: InventorySection; label: string; count: number }[] = [
    { id: 'available', label: 'Available', count: availableItems.length },
    { id: 'finished', label: 'Finish / Exp', count: finishedItems.length },
    { id: 'buy', label: 'To Buy', count: buyListItems.length },
  ];
  const sectionItems = section === 'available' ? availableItems : section === 'finished' ? finishedItems : buyListItems;
  const expiringSoon = availableItems.filter((item) => item.expiryDateEpoch != null && daysUntil(item.expiryDateEpoch, now) <= 7).length;

  const handleAddItem = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) return;
    const parsedExpiryDays = Number.parseInt(expiryDays, 10);
    await db.items.put({
      id: crypto.randomUUID(),
      title: title.trim(),
      category: newCategory,
      lastUpdated: Date.now(),
      expiryDateEpoch: Number.isFinite(parsedExpiryDays) ? Date.now() + Math.max(0, parsedExpiryDays) * 86_400_000 : null,
      quantity: 1,
      isAvailable: true,
      isOnBuyList: false,
    });
    setTitle('');
    setNewCategory('OTHERS');
    setExpiryDays('14');
    setShowAddForm(false);
  };

  const mergeSyncedData = async (incomingItems: SyncItem[]) => {
    await db.transaction('rw', db.items, async () => {
      for (const incoming of incomingItems) {
        const existing = await db.items.get(incoming.id);
        if (!existing || incoming.lastUpdated > existing.lastUpdated) await db.items.put(incoming);
      }
    });
  };

  const updateItem = async (item: SyncItem, changes: Partial<SyncItem>) => {
    await db.items.put({ ...item, ...changes, lastUpdated: Date.now() });
  };

  const addBuyListItem = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const itemTitle = buyListTitle.trim();
    if (!itemTitle) return;
    await db.items.put({ id: crypto.randomUUID(), title: itemTitle, category: 'OTHERS', lastUpdated: Date.now(), isAvailable: false, isOnBuyList: true });
    setBuyListTitle('');
  };

  const removeItem = async (item: SyncItem) => db.items.delete(item.id);

  const exportBackup = async () => {
    try {
      const backup = {
        format: 'freshkeep-backup',
        version: 1,
        exportedAt: new Date().toISOString(),
        items: await db.items.toArray(),
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `freshkeep-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setBackupMessage(`Backup exported with ${backup.items.length} items.`);
    } catch (error) {
      console.error('Could not export backup:', error);
      setBackupMessage('Could not export the backup. Please try again.');
    }
  };

  const importBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileInput = event.currentTarget;
    const file = fileInput.files?.[0];
    if (!file) return;

    try {
      const backup = parseBackup(JSON.parse(await file.text()) as unknown);
      await db.transaction('rw', db.items, async () => {
        await db.items.bulkPut(backup);
      });
      setBackupMessage(`Restored ${backup.length} items. Existing items not in the file were kept.`);
    } catch (error) {
      console.error('Could not import backup:', error);
      setBackupMessage(error instanceof Error ? error.message : 'Could not import this backup file.');
    } finally {
      fileInput.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 pb-10 pt-5 sm:px-7 sm:pt-8">
              <header className="mb-7 flex items-center justify-between">
                <div className="flex items-center gap-2.5"><span className="flex size-9 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]"><Leaf size={21} aria-hidden="true" /></span><h1 className="text-[23px] font-semibold leading-none">FreshKeep</h1></div>
                <div className="relative flex items-center gap-2">
                  <button type="button" onClick={() => setIsSyncOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--outline)] bg-white px-4 text-sm font-medium text-[var(--primary)] transition hover:bg-[var(--primary-soft)]"><Smartphone size={17} aria-hidden="true" />Sync</button>
                  <button type="button" onClick={() => { setSettingsOpen((open) => !open); setBackupMessage(''); }} aria-expanded={settingsOpen} aria-label="Settings" title="Settings" className="flex size-10 items-center justify-center rounded-full border border-[var(--outline)] bg-white text-[var(--muted)] hover:bg-[var(--surface-variant-soft)]"><Settings size={19} aria-hidden="true" /></button>
                  {settingsOpen && (
                    <div className="absolute right-0 top-12 z-30 w-72 rounded-2xl border border-[var(--outline)] bg-white p-3 shadow-lg">
                      <p className="px-2 pb-2 text-xs font-semibold uppercase text-[var(--muted)]">Backup &amp; restore</p>
                      <button type="button" onClick={exportBackup} className="flex h-11 w-full items-center gap-3 rounded-xl px-2 text-left text-sm hover:bg-[var(--surface-variant-soft)]"><Download size={18} className="text-[var(--primary)]" aria-hidden="true" />Export Backup (.json)</button>
                      <button type="button" onClick={() => backupFileInputRef.current?.click()} className="flex h-11 w-full items-center gap-3 rounded-xl px-2 text-left text-sm hover:bg-[var(--surface-variant-soft)]"><Upload size={18} className="text-[var(--primary)]" aria-hidden="true" />Import Backup (.json)</button>
                      <input ref={backupFileInputRef} type="file" accept=".json,application/json" onChange={importBackup} className="sr-only" aria-label="Choose a FreshKeep JSON backup" />
                      {backupMessage && <p role="status" className="mt-2 border-t border-[var(--outline)] px-2 pt-2 text-xs leading-5 text-[var(--muted)]">{backupMessage}</p>}
                    </div>
                  )}
                </div>
              </header>
              {installPlatform && (
                <aside className="mb-5 flex items-start gap-3 rounded-2xl border border-[#c9ddec] bg-[#eaf4fb] p-3.5 text-[#173c56]">
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-[var(--primary)]">{installPlatform === 'ios' ? <Share size={18} aria-hidden="true" /> : <MonitorDown size={18} aria-hidden="true" />}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{installPlatform === 'ios' ? 'Add FreshKeep to your Home Screen' : 'Install FreshKeep on this PC'}</p>
                    <p className="mt-1 text-xs leading-5 text-[#36566d]">{installPlatform === 'ios' ? <>Tap <span className="font-semibold">Share</span>, then <span className="font-semibold">Add to Home Screen</span> for offline access.</> : <>Open the browser menu and choose <span className="font-semibold">Install FreshKeep</span> (or <span className="font-semibold">Install this site as an app</span>) for offline access.</>}</p>
                    <p className="mt-1 text-[11px] leading-4 text-[#587183]">Offline access helps, but it is not a permanent backup.</p>
                  </div>
                  <button type="button" onClick={() => setInstallPlatform(null)} className="rounded-full p-1 text-[#587183] hover:bg-white" aria-label="Dismiss install tip"><X size={17} /></button>
                </aside>
              )}
              <div className="mb-5 flex items-end justify-between gap-4"><div><p className="text-sm text-[var(--muted)]">Your inventory</p><p className="mt-1 text-sm font-medium">{items.length} {items.length === 1 ? 'item' : 'items'}{expiringSoon > 0 && <span className="text-[var(--muted)]"> · {expiringSoon} expiring soon</span>}</p></div><button type="button" onClick={() => setShowAddForm((visible) => !visible)} aria-expanded={showAddForm} className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-white shadow-sm hover:bg-[var(--primary-hover)]" title="Add item">{showAddForm ? <X size={21} /> : <Plus size={22} />}</button></div>
              {showAddForm && <form onSubmit={handleAddItem} className="mb-5 rounded-2xl border border-[var(--outline)] bg-white p-4 shadow-sm"><div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Add item</h2><button type="button" onClick={() => setShowAddForm(false)} aria-label="Close add item form" className="rounded-full p-1.5 text-[var(--muted)] hover:bg-[var(--surface-variant)]"><X size={18} /></button></div><label className="mb-3 block"><span className="mb-1.5 block text-xs font-medium text-[var(--muted)]">Item name</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Oat milk" className="h-11 w-full rounded-xl border border-[var(--outline)] bg-white px-3 text-sm outline-none focus:border-[var(--primary)]" required /></label><div className="mb-4 grid grid-cols-2 gap-3"><label><span className="mb-1.5 block text-xs font-medium text-[var(--muted)]">Category</span><select value={newCategory} onChange={(event) => setNewCategory(event.target.value)} className="h-11 w-full rounded-xl border border-[var(--outline)] bg-white px-3 text-sm">{categories.filter((option) => option.value !== 'ALL' && option.value !== 'General').map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label><span className="mb-1.5 block text-xs font-medium text-[var(--muted)]">Expires in (days)</span><input type="number" min="0" value={expiryDays} onChange={(event) => setExpiryDays(event.target.value)} className="h-11 w-full rounded-xl border border-[var(--outline)] bg-white px-3 text-sm" /></label></div><button type="submit" className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[var(--primary)] text-sm font-semibold text-white hover:bg-[var(--primary-hover)]"><Plus size={17} />Add to inventory</button></form>}
              <div role="tablist" aria-label="Inventory sections" className="mb-4 grid grid-cols-3 gap-1 rounded-full bg-[var(--surface-variant)] p-1">{sections.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={section === tab.id} onClick={() => setSection(tab.id)} className={`flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-full px-2 text-xs sm:text-sm ${section === tab.id ? 'bg-white font-semibold shadow-sm' : 'text-[var(--muted)]'}`}><span className="truncate">{tab.label}</span><span className="text-[var(--primary)]">{tab.count}</span></button>)}</div>
              {section === 'buy' && <form onSubmit={addBuyListItem} className="mb-3 flex gap-2"><input value={buyListTitle} onChange={(event) => setBuyListTitle(event.target.value)} placeholder="Add an item to buy" className="h-11 min-w-0 flex-1 rounded-xl border border-[var(--outline)] bg-white px-3 text-sm" /><button type="submit" disabled={!buyListTitle.trim()} aria-label="Add to buy list" className="flex size-11 items-center justify-center rounded-full bg-[var(--primary)] text-white disabled:opacity-45"><Plus size={20} /></button></form>}
              <label className="mb-3 flex h-12 items-center gap-3 rounded-2xl bg-[var(--surface-variant-soft)] px-4"><Search size={19} className="shrink-0 text-[var(--muted)]" aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name" className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none" />{search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="text-[var(--muted)]"><X size={16} /></button>}</label>
              <div className="mb-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{categories.map((option) => <button key={option.value} type="button" onClick={() => setSelectedCategory(option.value)} aria-pressed={selectedCategory === option.value} className={`h-9 shrink-0 rounded-full px-3.5 text-xs font-medium ${selectedCategory === option.value ? 'bg-[var(--primary-soft)] text-[var(--primary)]' : 'bg-[var(--surface-variant-soft)] text-[var(--muted)]'}`}>{option.label}</button>)}</div>
              <section aria-label={`${section} items`} className="flex flex-col gap-2.5">{sectionItems.length === 0 ? <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--outline)] bg-white/70 px-6 text-center"><span className="mb-3 flex size-12 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]"><Leaf size={23} /></span><p className="font-medium">{search || selectedCategory !== 'ALL' ? 'No matching items' : section === 'available' ? 'No available items' : section === 'finished' ? 'No finished or expired items' : 'Your buy list is empty'}</p><p className="mt-1 text-sm text-[var(--muted)]">{search || selectedCategory !== 'ALL' ? 'Try another search or category.' : section === 'available' ? 'Add an item to get started.' : 'Items will show up here when you need them.'}</p></div> : sectionItems.map((item) => {
                const expired = item.expiryDateEpoch != null && item.expiryDateEpoch < now;
                const remainingDays = item.expiryDateEpoch == null ? null : daysUntil(item.expiryDateEpoch, now);
                const statusClass = expired ? 'bg-[var(--danger-soft)] text-[var(--danger)]' : remainingDays != null && remainingDays <= 7 ? 'bg-[var(--warning-soft)] text-[var(--warning)]' : 'bg-[var(--surface-variant-soft)] text-[var(--muted)]';
                return <article key={item.id} className="flex min-h-[76px] items-center gap-2 rounded-2xl border border-[var(--outline)] bg-white px-2.5 py-3 shadow-[0_1px_2px_rgba(20,35,48,0.03)] sm:gap-3 sm:px-4"><span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-sm font-semibold text-[var(--primary)]">{item.title.trim().charAt(0).toUpperCase() || '?'}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.title}</p><p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-[var(--muted)]"><span className="truncate">{categoryName(item.category)}</span>{item.quantity != null && <><span>·</span><span>Qty {item.quantity}</span></>}</p></div>{section === 'available' && remainingDays != null && <span className={`hidden shrink-0 rounded-full px-2.5 py-1.5 text-[10px] font-semibold sm:inline-flex ${statusClass}`}>{expired ? 'Expired' : remainingDays === 0 ? 'Expires today' : `${remainingDays} days left`}</span>}{section === 'buy' ? <button type="button" onClick={() => updateItem(item, { isOnBuyList: false, isAvailable: true, expiryDateEpoch: null })} title="Mark as purchased" aria-label={`Mark ${item.title} as purchased`} className="flex size-9 shrink-0 items-center justify-center rounded-full text-[var(--primary)] hover:bg-[var(--primary-soft)]"><PackageCheck size={19} /></button> : <><button type="button" onClick={() => updateItem(item, { isAvailable: section === 'finished', isOnBuyList: false })} title={section === 'finished' ? 'Mark as available' : 'Mark as finished'} aria-label={`${section === 'finished' ? 'Mark' : 'Finish'} ${item.title}`} className="flex size-9 shrink-0 items-center justify-center rounded-full text-[var(--primary)] hover:bg-[var(--primary-soft)]">{section === 'finished' ? <RotateCcw size={18} /> : <CircleCheck size={19} />}</button><button type="button" onClick={() => updateItem(item, { isAvailable: false, isOnBuyList: true })} title="Add to buy list" aria-label={`Add ${item.title} to buy list`} className="flex size-9 shrink-0 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--surface-variant-soft)]"><ShoppingBasket size={18} /></button></>}<button type="button" onClick={() => removeItem(item)} title="Remove item" aria-label={`Remove ${item.title}`} className="flex size-9 shrink-0 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"><Trash2 size={17} /></button></article>;
              })}</section>
              <SyncModal isOpen={isSyncOpen} onClose={() => setIsSyncOpen(false)} onDataReceived={mergeSyncedData} />
            </main>
          </div>
        );
      }
