import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, firstValueFrom, map, of, tap } from 'rxjs';

import { API_BASE_URL } from '../config/api.config';
import { HANDLE_UNAUTHORIZED } from '../http/http-context';
import { AuthResponse, LoginRequest, RegisterRequest, User } from './auth.models';
import { StoredSession, TokenStore } from './token-store';

const NO_SESSION_EXPIRY = new HttpContext().set(HANDLE_UNAUTHORIZED, false);

/** renewed: new tokens saved. rejected: the server refused the refresh token, so the session is over (the caller ends it). unavailable: we could not ask (offline), so nothing changed. */
export type RenewOutcome = 'renewed' | 'rejected' | 'unavailable';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);
  private readonly store = inject(TokenStore);
  private readonly router = inject(Router);

  private readonly session = signal<StoredSession | null>(this.store.read());
  private readonly currentUser = signal<User | null>(null);
  private renewing: Promise<RenewOutcome> | null = null;

  /** The signed-in user once known; null while loading or when signed out. */
  readonly user = this.currentUser.asReadonly();
  readonly isSignedIn = computed(() => this.session() !== null);

  /** True only while a stored token exists and has not passed its expiry time. */
  hasValidSession(): boolean {
    const session = this.session();
    return session !== null && Date.parse(session.expiresAt) > Date.now();
  }

  /** Whether a signed-in device could get a new access token without a password. */
  canRenew(): boolean {
    return this.latestRefreshToken() !== null;
  }

  /** This device's refresh token, for the calls that need to say "this device" (sign out, change password). */
  refreshToken(): string | null {
    return this.latestRefreshToken();
  }

  /**
   * Trades the refresh token for new tokens. Several callers asking at once share one request, because the refresh
   * token works once and a second parallel request would look like a replay.
   */
  renew(): Promise<RenewOutcome> {
    this.renewing ??= this.requestRenewal().finally(() => (this.renewing = null));
    return this.renewing;
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
   * Signs out immediately. The server call ends this device's refresh token so it cannot be used again; we do not
   * wait for it, and a failure changes nothing for the user (the token still expires on its own).
   */
  signOut(): void {
    this.http
      .post<void>(`${this.base}/auth/logout`, { refreshToken: this.latestRefreshToken() }, { context: NO_SESSION_EXPIRY })
      .pipe(catchError(() => of(null)))
      .subscribe();
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
      // The access token is short-lived; a stored refresh token turns "expired an hour ago" into "still signed in".
      if (!this.canRenew() || (await this.renew()) === 'rejected') {
        this.clearSession();
      }
      if (!this.hasValidSession()) {
        return;
      }
    }
    try {
      this.currentUser.set(await this.loadUser());
    } catch (error) {
      if ((error as { status?: number }).status !== 401) {
        return;
      }
      // The access token was refused (for example it was revoked). That is not the end while a refresh token can replace it.
      if (this.canRenew() && (await this.renew()) === 'renewed') {
        try {
          this.currentUser.set(await this.loadUser());
          return;
        } catch (again) {
          if ((again as { status?: number }).status !== 401) {
            return;
          }
        }
      }
      this.clearSession();
    }
  }

  private loadUser(): Promise<User> {
    return firstValueFrom(this.http.get<User>(`${this.base}/auth/me`, { context: NO_SESSION_EXPIRY }));
  }

  /** Another tab may have rotated the token since this one loaded, so the stored copy is the newer one. */
  private latestRefreshToken(): string | null {
    return this.store.read()?.refreshToken ?? this.session()?.refreshToken ?? null;
  }

  private async requestRenewal(): Promise<RenewOutcome> {
    const refreshToken = this.latestRefreshToken();
    if (refreshToken === null) {
      return 'rejected';
    }
    try {
      this.startSession(await firstValueFrom(this.http.post<AuthResponse>(`${this.base}/auth/refresh`, { refreshToken }, { context: NO_SESSION_EXPIRY })));
      return 'renewed';
    } catch (error) {
      const status = (error as { status?: number }).status;
      // Only a definite "no" ends the session; a dropped connection or a server hiccup must not sign anyone out.
      if (status === 401 || status === 400) {
        return 'rejected';
      }
      return 'unavailable';
    }
  }

  private startSession(response: AuthResponse): void {
    const session: StoredSession = { accessToken: response.accessToken, expiresAt: response.expiresAt, refreshToken: response.refreshToken };
    this.store.write(session);
    this.session.set(session);
    this.currentUser.set(response.user);
  }
}
