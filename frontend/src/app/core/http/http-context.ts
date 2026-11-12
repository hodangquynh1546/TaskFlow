import { HttpContextToken } from '@angular/common/http';

/**
 * Whether a 401 for this request means "the session is over". True for ordinary calls; false for login/register
 * (a 401 there is just a wrong password) and for the silent session check at startup.
 */
export const HANDLE_UNAUTHORIZED = new HttpContextToken<boolean>(() => true);
