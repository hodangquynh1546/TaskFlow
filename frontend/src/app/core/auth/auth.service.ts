import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, firstValueFrom, map, of, tap } from 'rxjs';

import { API_BASE_URL } from '../config/api.config';
import { HANDLE_UNAUTHORIZED } from '../http/http-context';
import { AuthResponse, LoginRequest, RegisterRequest, User } from './auth.models';
import { StoredSession, TokenStore } from './token-store';

const NO_SESSION_EXPIRY = new HttpContext().set(HANDLE_UNAUTHORIZED, false);

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);
  private readonly store = inject(TokenStore);
  private readonly router = inject(Router);

  private readonly session = signal<StoredSession | null>(this.store.read());
  private readonly currentUser = signal<User | null>(null);

  /** The signed-in user once known; null while loading or when signed out. */
  readonly user = this.currentUser.asReadonly();
  readonly isSignedIn = computed(() => this.session() !== null);

  /** True only while a stored token exists and has not passed its expiry time. */
  hasValidSession(): boolean {
    const session = this.session();
    return session !== null && Date.parse(session.expiresAt) > Date.now();
  }

  accessToken(): string | null {
    return this.hasValidSession() ? (this.session()?.accessToken ?? null) : null;
  }

  login(request: LoginRequest): Observable<User> {
    return this.http
      .post<AuthResponse>(`${this.base}/auth/login`, request, { context: NO_SESSION_EXPIRY })
      .pipe(tap((response) => this.startSession(response)), map((response) => response.user));
  }

  register(request: RegisterRequest): Observable<User> {
    return this.http
      .post<AuthResponse>(`${this.base}/auth/register`, request, { context: NO_SESSION_EXPIRY })
      .pipe(tap((response) => this.startSession(response)), map((response) => response.user));
  }

  /**
   * Signs out immediately. Tokens are stateless (ADR-05) so the server call is a courtesy: we do not wait for it
   * and a failure changes nothing for the user.
   */
  signOut(): void {
    this.http.post<void>(`${this.base}/auth/logout`, null, { context: NO_SESSION_EXPIRY }).pipe(catchError(() => of(null))).subscribe();
    this.clearSession();
    void this.router.navigate(['/login']);
  }

  /** The server rejected our token (or it expired): drop it and send the user to sign in again. */
  expireSession(): void {
    if (this.session() === null) {
      return;
    }
    const returnUrl = this.router.url;
    this.clearSession();
    void this.router.navigate(['/login'], {
      queryParams: { reason: 'expired', ...(returnUrl && returnUrl !== '/' ? { returnUrl } : {}) },
    });
  }

  /** Replaces the cached user after the profile changes, so the header updates without a reload. */
  updateUser(user: User): void {
    this.currentUser.set(user);
  }

  clearSession(): void {
    this.store.clear();
    this.session.set(null);
    this.currentUser.set(null);
  }

  /**
   * Runs once at startup: confirms a stored token still works and loads the user for the header.
   * A network failure keeps the session (the user may just be offline); only a rejected token ends it.
   */
  async restoreSession(): Promise<void> {
    if (!this.hasValidSession()) {
      this.clearSession();
      return;
    }
    try {
      const user = await firstValueFrom(this.http.get<User>(`${this.base}/auth/me`, { context: NO_SESSION_EXPIRY }));
      this.currentUser.set(user);
    } catch (error) {
      if ((error as { status?: number }).status === 401) {
        this.clearSession();
      }
    }
  }

  private startSession(response: AuthResponse): void {
    const session: StoredSession = { accessToken: response.accessToken, expiresAt: response.expiresAt };
    this.store.write(session);
    this.session.set(session);
    this.currentUser.set(response.user);
  }
}
