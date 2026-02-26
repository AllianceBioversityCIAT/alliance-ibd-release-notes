import type { HistoryEntry } from "./types";

const STORAGE_KEY = "release-notes-history";
const MAX_ENTRIES = 50;

function getAll(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function getNotes(): HistoryEntry[] {
  return getAll().sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function saveNote(entry: Omit<HistoryEntry, "id" | "createdAt">): HistoryEntry {
  const notes = getAll();
  const newEntry: HistoryEntry = {
    ...entry,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  notes.unshift(newEntry);
  // Prune oldest beyond max
  const trimmed = notes.slice(0, MAX_ENTRIES);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  return newEntry;
}

export function deleteNote(id: string): void {
  const notes = getAll().filter((n) => n.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}
