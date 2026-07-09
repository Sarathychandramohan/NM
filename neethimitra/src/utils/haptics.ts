/**
 * Safe haptics wrapper — silently skips on web where expo-haptics is unsupported.
 * Import from here instead of expo-haptics directly.
 */
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

export const safeImpact = (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(style).catch(() => {});
  }
};

export const safeNotification = (type: Haptics.NotificationFeedbackType = Haptics.NotificationFeedbackType.Success) => {
  if (Platform.OS !== 'web') {
    Haptics.notificationAsync(type).catch(() => {});
  }
};

export const safeSelection = () => {
  if (Platform.OS !== 'web') {
    Haptics.selectionAsync().catch(() => {});
  }
};

export { Haptics };
