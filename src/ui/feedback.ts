import * as Haptics from 'expo-haptics';

/**
 * The only module that imports expo-haptics, so there is one place to disable
 * it. Both calls are fire-and-forget: a failed haptic must never interrupt the
 * write it accompanies, and on a device with no taptic engine these reject.
 */

/** A press landed. */
export function tap(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Something was committed — a stop saved, a date published, a cover set. */
export function commit(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
