// Typed access to the globally-mocked notifications spies (installed in setup.ts).
//
// Usage in a scenario:
//   const notes = notificationSpies();
//   ...trigger an approval...
//   expect(notes.notifyApprovalRequest).toHaveBeenCalledOnce();
import type { Mock } from 'vitest';
import * as notifications from '@/lib/notifications';

export function notificationSpies(): {
  ensureNotificationPermission: Mock;
  notifyApprovalRequest: Mock;
  notifyElicitationRequest: Mock;
  notifySessionEnded: Mock;
  appIsHidden: Mock;
} {
  return {
    ensureNotificationPermission: notifications.ensureNotificationPermission as unknown as Mock,
    notifyApprovalRequest: notifications.notifyApprovalRequest as unknown as Mock,
    notifyElicitationRequest: notifications.notifyElicitationRequest as unknown as Mock,
    notifySessionEnded: notifications.notifySessionEnded as unknown as Mock,
    appIsHidden: notifications.appIsHidden as unknown as Mock,
  };
}
