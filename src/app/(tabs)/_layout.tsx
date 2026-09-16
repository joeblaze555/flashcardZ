/**
 * FlashCardZ tab navigation (Expo Router, SDK 57).
 *
 * SDK 55–57 uses `expo-router/unstable-native-tabs` (renamed to
 * `expo-router/native-tabs` in SDK 58+). Tabs must be declared
 * explicitly with `NativeTabs.Trigger` — file existence alone does
 * not add them to the bar.
 *
 * Routes:
 * - index    -> Decks (default tab)
 * - study    -> Study / Review queue
 * - stats    -> Stats overview
 * - settings -> Backup / preferences
 */

import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useTheme } from '@/hooks/use-theme';

export default function TabsLayout() {
  const theme = useTheme();

  return (
    <NativeTabs
      backgroundColor={theme.background}
      tintColor={theme.text}
      labelStyle={{ color: theme.text }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Decks</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'square.stack', selected: 'square.stack.fill' }} md="style" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="study">
        <NativeTabs.Trigger.Label>Study</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'graduationcap', selected: 'graduationcap.fill' }}
          md="school"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="stats">
        <NativeTabs.Trigger.Label>Stats</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'chart.bar', selected: 'chart.bar.fill' }} md="bar_chart" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
