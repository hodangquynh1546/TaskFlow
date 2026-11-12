import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { User } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { ProfileService } from './profile.service';

const USER: User = { id: 'u1', fullName: 'Tên Mới', email: 'moi@example.com', createdAt: '', updatedAt: '' };

function setup() {
  localStorage.clear();
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
  return { service: TestBed.inject(ProfileService), auth: TestBed.inject(AuthService), http: TestBed.inject(HttpTestingController) };
}

describe('ProfileService', () => {
  it('loads the profile', () => {
    const { service, http } = setup();
    let result: User | undefined;

    service.get().subscribe((u) => (result = u));
    http.expectOne('/api/users/profile').flush(USER);

    expect(result).toEqual(USER);
  });

  it('updating the profile also refreshes the user shown in the header', () => {
    const { service, auth, http } = setup();
    expect(auth.user()).toBeNull();

    service.update({ fullName: 'Tên Mới', email: 'moi@example.com' }).subscribe();
    const req = http.expectOne('/api/users/profile');
    expect([req.request.method, req.request.body]).toEqual(['PUT', { fullName: 'Tên Mới', email: 'moi@example.com' }]);
    req.flush(USER);

    expect(auth.user()).toEqual(USER);
  });

  it('a failed update leaves the header user unchanged', () => {
    const { service, auth, http } = setup();
    auth.updateUser({ ...USER, fullName: 'Cũ' });

    service.update({ fullName: 'Mới', email: 'moi@example.com' }).subscribe({ error: () => undefined });
    http.expectOne('/api/users/profile').flush({}, { status: 409, statusText: 'Conflict' });

    expect(auth.user()!.fullName).toBe('Cũ');
  });

  it('changes the password through the auth endpoint', () => {
    const { service, http } = setup();

    service.changePassword({ currentPassword: 'a', newPassword: 'b' }).subscribe();
    const req = http.expectOne('/api/auth/change-password');

    expect([req.request.method, req.request.body]).toEqual(['POST', { currentPassword: 'a', newPassword: 'b' }]);
  });
});
