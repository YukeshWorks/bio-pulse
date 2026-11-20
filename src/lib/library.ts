import { useSyncExternalStore } from 'react';
import type { BioRecord } from '../../shared/schema';

/**
 * Personal library kept in this browser only (localStorage): saved records and followed topics.
 * Nothing leaves the device, no account is needed. Every storage access is wrapped because storage
 * can be unavailable (private mode, blocked site data); the app then keeps state in memory.
 */

export type SavedRecord = Pick<BioRecord, 'id' | 'title' | 'url' | 'authors' | 'organization' | 'venue' | 'date' | 'evidence' | 'identifiers' | 'source'> & { savedAt: string };

interface LibraryState {
  saved: SavedRecord[];
  topics: string[];
}

const KEY = 'biopulse:library:v1';
const listeners = new Set<() => void>();
let state: LibraryState = load();

function load(): LibraryState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { saved: [], topics: [] };
    const p = JSON.parse(raw) as Partial<LibraryState>;
    return {
      saved: Array.isArray(p.saved) ? p.saved.filter((s) => s && typeof s.id === 'string' && typeof s.url === 'string' && /^https:\/\//.test(s.url)) : [],
      topics: Array.isArray(p.topics) ? p.topics.filter((t) => typeof t === 'string').slice(0, 20) : [],
    };
  } catch {
    return { saved: [], topics: [] };
  }
}

function commit(next: LibraryState) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable: keep in memory for this visit */
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useLibrary(): LibraryState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

export function snapshot(r: BioRecord): SavedRecord {
  return { id: r.id, title: r.title, url: r.url, authors: r.authors.slice(0, 10), organization: r.organization, venue: r.venue, date: r.date, evidence: r.evidence, identifiers: r.identifiers, source: r.source, savedAt: new Date().toISOString() };
}

export const isSaved = (id: string) => state.saved.some((s) => s.id === id);

export function toggleSaved(r: BioRecord): boolean {
  if (isSaved(r.id)) {
    commit({ ...state, saved: state.saved.filter((s) => s.id !== r.id) });
    return false;
  }
  commit({ ...state, saved: [snapshot(r), ...state.saved].slice(0, 500) });
  return true;
}

export function removeSaved(id: string) {
  commit({ ...state, saved: state.saved.filter((s) => s.id !== id) });
}

export function clearSaved() {
  commit({ ...state, saved: [] });
}

export function normaliseTopic(t: string): string {
  return t.replace(/\s+/g, ' ').trim().slice(0, 40);
}

export function addTopic(t: string) {
  const v = normaliseTopic(t);
  if (!v || state.topics.some((x) => x.toLowerCase() === v.toLowerCase())) return;
  commit({ ...state, topics: [...state.topics, v].slice(0, 20) });
}

export function removeTopic(t: string) {
  commit({ ...state, topics: state.topics.filter((x) => x !== t) });
}

/** Records matching a topic: every word of the topic must appear in title, summary, venue or field names. */
export function matchTopic(records: BioRecord[], topic: string, fieldNames: (id: string) => string): BioRecord[] {
  const words = topic.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return records.filter((r) => {
    const hay = `${r.title} ${r.summary.text} ${r.venue ?? ''} ${r.categories.map(fieldNames).join(' ')} ${r.trial?.conditions?.join(' ') ?? ''}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** Test helper: reset in-memory state. */
export function __resetLibrary(next: LibraryState = { saved: [], topics: [] }) {
  state = next;
  listeners.forEach((l) => l());
}
