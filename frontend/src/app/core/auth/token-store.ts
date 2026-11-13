import { Injectable } from '@angular/core';

export interface StoredSession {
  accessToken: string;
  expiresAt: string;
  /** What keeps the user signed in after the access token expires. Absent in sessions saved by older versions. */
  refreshToken?: string;
}

const STORAGE_KEY = 'taskflow.session';

function isStoredSession(value: unknown): value is StoredSession {
  const v = value as Partial<StoredSession> | null;
  return (
    typeof v?.accessToken === 'string' &&
    typeof v?.expiresAt === 'string' &&
    !Number.isNaN(Date.parse(v.expiresAt)) &&
    (v.refreshToken === undefined || typeof v.refreshToken === 'string')
  );
}

/**
 * Persists the session in localStorage (ADR-06). Storage can be unavailable or throw (private windows, blocked site data),
 * so every access is guarded and an in-memory copy keeps the current tab signed in regardless.
 */
@Injectable({ providedIn: 'root' })
export class TokenStore {
  private memory: StoredSession | null = null;

  read(): StoredSession | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) {
        return this.memory;
      }
      const parsed: unknown = JSON.parse(raw);
      return isStoredSession(parsed) ? parsed : null;
    } catch {
      return this.memory;
    }
  }

  write(session: StoredSession): void {
    this.memory = session;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Storage is unavailable; the in-memory copy still serves this tab.
    }
  }

  clear(): void {
    this.memory = null;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to clean up if storage is unavailable.
    }
  }
}
