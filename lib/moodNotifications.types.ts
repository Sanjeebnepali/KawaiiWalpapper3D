/**
 * Shared type definitions for the mood-notification subsystem.
 *
 * Extracted verbatim from `moodNotifications.ts` to keep that file under
 * the size cap. These are plain structural types (no runtime behavior), so
 * moving them is behavior-neutral. Both are re-exported from
 * `moodNotifications.ts` for any existing importers.
 */

export type NotificationsLike = {
  setNotificationHandler?: (handler: unknown) => void;
  setNotificationCategoryAsync?: (
    name: string,
    actions: Array<{
      identifier: string;
      buttonTitle: string;
      options?: { opensAppToForeground?: boolean };
    }>,
  ) => Promise<unknown>;
  scheduleNotificationAsync?: (input: {
    identifier?: string;
    content: {
      title: string;
      body: string;
      categoryIdentifier?: string;
      data?: Record<string, unknown>;
    };
    trigger: unknown;
  }) => Promise<string>;
  cancelScheduledNotificationAsync?: (id: string) => Promise<void>;
  cancelAllScheduledNotificationsAsync?: () => Promise<void>;
  /** Remove a NOW-DISPLAYED notification from the system shade. Does NOT
   *  affect future scheduled fires of the same identifier. */
  dismissNotificationAsync?: (identifier: string) => Promise<void>;
  getPermissionsAsync?: () => Promise<{
    granted?: boolean;
    status?: string;
    canAskAgain?: boolean;
  }>;
  requestPermissionsAsync?: () => Promise<{ granted?: boolean; status?: string }>;
  addNotificationResponseReceivedListener?: (
    cb: (response: NotificationResponseLike) => void,
  ) => { remove: () => void };
  getLastNotificationResponseAsync?: () => Promise<NotificationResponseLike | null>;
  SchedulableTriggerInputTypes?: {
    DAILY?: unknown;
    CALENDAR?: unknown;
    TIME_INTERVAL?: unknown;
  };
  AndroidImportance?: { HIGH?: number; DEFAULT?: number };
};

export type NotificationResponseLike = {
  actionIdentifier: string;
  notification: {
    request: {
      /** Identifier of the displayed notification — used to clear the
       *  banner from the system shade after we handle the action. */
      identifier?: string;
      content: { data?: Record<string, unknown> };
    };
  };
};
