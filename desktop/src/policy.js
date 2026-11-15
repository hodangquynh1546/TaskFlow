'use strict';

/**
 * Which permission requests the window grants. The page shows notifications (reminders) and nothing else: no camera,
 * microphone, location, and only for our own address, never for anything a link might have loaded.
 */
function allowPermission(permission, requestingUrl, ownUrl) {
  if (permission !== 'notifications' || !ownUrl || !requestingUrl) {
    return false;
  }
  try {
    return new URL(requestingUrl).origin === new URL(ownUrl).origin;
  } catch {
    return false;
  }
}

/** Closing the window hides it instead, so the app keeps running to remind. Quitting for real is the only way out. */
function shouldHideOnClose({ quitting }) {
  return !quitting;
}

module.exports = { allowPermission, shouldHideOnClose };
