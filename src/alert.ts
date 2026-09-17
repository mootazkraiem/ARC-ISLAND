// react-native-web's Alert.alert is a literal no-op — its own source is
// `static alert() {}`. Nothing shows, and critically no button's onPress
// ever fires. Every confirm dialog in this app (delete a reminder, dismiss
// an idea) is exactly "Cancel" + one destructive action button with
// onPress — on web, calling the real Alert.alert there would silently do
// nothing at all: no dialog, and the action never happens. That's a real
// break for "manage my reminders" (delete would just stop working), not a
// cosmetic one, so this substitutes the browser's own native
// window.alert/window.confirm only on web. Native iOS/Android keep calling
// the real Alert.alert, completely unchanged.
import { Alert, Platform } from 'react-native';

interface AlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

export function safeAlert(title: string, message?: string, buttons?: AlertButton[]) {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons as any);
    return;
  }

  // `(globalThis as any).window` rather than the bare `window` global: this
  // file compiles under the same tsconfig as the rest of the app, which
  // doesn't assume the DOM lib is present (it normally isn't needed on
  // native), so this avoids depending on that.
  const win = (globalThis as any).window;
  const body = message ? `${title}\n\n${message}` : title;

  if (!buttons || buttons.length === 0) {
    win?.alert(body);
    return;
  }

  // Every multi-button alert in this app is "Cancel" + one action button —
  // window.confirm's OK/Cancel maps directly onto that.
  const action = buttons.find((b) => b.style !== 'cancel') ?? buttons[buttons.length - 1];
  const cancelBtn = buttons.find((b) => b.style === 'cancel');
  if (win?.confirm(body)) {
    action.onPress?.();
  } else {
    cancelBtn?.onPress?.();
  }
}
