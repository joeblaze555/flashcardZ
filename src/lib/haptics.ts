/**
 * Haptics helpers — thin wrappers over expo-haptics that respect the
 * user's preference stored by the Settings tab (`1` = on, `0` = off,
 * missing = on). All fire-and-forget safe: never throws.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

export const HAPTICS_ENABLED_KEY = '@flashcardz/haptics-enabled';

export async function isHapticsEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(HAPTICS_ENABLED_KEY)) !== '0';
  } catch {
    return true;
  }
}

export async function playSelection(): Promise<void> {
  try {
    if (!(await isHapticsEnabled())) return;
    await Haptics.selectionAsync();
  } catch {
    // Haptics unavailable (e.g. unsupported device) — stay silent.
  }
}

export async function playImpact(
  style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light,
): Promise<void> {
  try {
    if (!(await isHapticsEnabled())) return;
    await Haptics.impactAsync(style);
  } catch {
    // Ignore — haptics are best-effort feedback.
  }
}

export async function playNotification(
  type: Haptics.NotificationFeedbackType = Haptics.NotificationFeedbackType.Success,
): Promise<void> {
  try {
    if (!(await isHapticsEnabled())) return;
    await Haptics.notificationAsync(type);
  } catch {
    // Ignore — haptics are best-effort feedback.
  }
}
