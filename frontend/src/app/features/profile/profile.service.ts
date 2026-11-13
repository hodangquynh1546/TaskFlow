import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { User } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { API_BASE_URL } from '../../core/config/api.config';

export interface UpdateProfileRequest {
  fullName: string;
  email: string;
  /** Required by the server only when the email changes. */
  currentPassword?: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);
  private readonly auth = inject(AuthService);

  get(): Observable<User> {
    return this.http.get<User>(`${this.base}/users/profile`);
  }

  /** Also refreshes the user shown in the header. */
  update(request: UpdateProfileRequest): Observable<User> {
    return this.http.put<User>(`${this.base}/users/profile`, request).pipe(tap((user) => this.auth.updateUser(user)));
  }

  /** Naming this device's refresh token lets the server sign out every other device without signing out this one. */
  changePassword(request: ChangePasswordRequest): Observable<void> {
    return this.http.post<void>(`${this.base}/auth/change-password`, { ...request, refreshToken: this.auth.refreshToken() });
  }
}
