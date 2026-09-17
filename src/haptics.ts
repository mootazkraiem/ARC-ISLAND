// Thin wrapper around expo-haptics used by every screen that fires haptic
// feedback (ReminderCard, HomeScreen, EditorScreen, AssistantScreen).
//
// Added for web compatibility: haptic feedback has no meaningful equivalent
// in a browser tab, and expo-haptics does not list Web as a supported
// platform for any of its methods, so calling them there is unverified at
// best. Rather than sprinkle `if (Platform.OS === 'web') return;` at every
// call site, this makes it a no-op on web in one place. Native iOS/Android
// behavior is completely unchanged — same functions, same arguments, same
// underlying expo-haptics calls.
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

export const safeHaptics = {
  impact: (style: Haptics.ImpactFeedbackStyle) => {
    if (Platform.OS === 'web') return;
    Haptics.impactAsync(style).catch(() => {});
  },
  notification: (type: Haptics.NotificationFeedbackType) => {
    if (Platform.OS === 'web') return;
    Haptics.notificationAsync(type).catch(() => {});
  },
  selection: () => {
    if (Platform.OS === 'web') return;
    Haptics.selectionAsync().catch(() => {});
  },
};
