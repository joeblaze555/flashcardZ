/**
 * Settings tab — data management, preferences, and about.
 *
 * Glassmorphic sections over the fixed deep-slate theme. All data flows
 * preserved: JSON export (file + share sheet + on-device copy), JSON/file
 * import with validation, CSV bulk import into a chosen deck, haptics
 * preference, daily goal + reminder prefs, and confirmed database wipe.
 */

import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { useFocusEffect } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Constants from 'expo-constants';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import {
  bulkCreateCards,
  clearDatabase,
  exportData,
  getDecksWithCounts,
  importData,
  type BackupPayload,
} from '@/db/database';
import type { DeckWithCounts } from '@/db/schema';
import { HAPTICS_ENABLED_KEY as HAPTICS_KEY } from '@/lib/haptics';
import {
  DEFAULT_DAILY_GOAL,
  DEFAULT_REMINDER_HOUR,
  MAX_DAILY_GOAL,
  MIN_DAILY_GOAL,
  clampGoal,
  getDailyGoal,
  getReminderEnabled,
  getReminderHour,
  setDailyGoal,
  setReminderEnabled,
  setReminderHour,
} from '@/lib/daily-goal';
import { parseBulkInput } from '@/components/BulkImportModal';
import { useTheme } from '@/hooks/use-theme';

const BG = '#0F172A';
const CARD = '#1E293B';
const BORDER = '#334155';
const INK = '#F8FAFC';
const MUTED = '#94A3B8';
const EMERALD = '#10B981';
const CYAN = '#22D3EE';
const VIOLET = '#8B5CF6';
const CRIMSON = '#EF4444';
const LAST_BACKUP_KEY = '@flashcardz/last-backup';

function isBackupPayload(value: unknown): value is BackupPayload {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.version === 1 &&
    Array.isArray(v.decks) &&
    Array.isArray(v.cards) &&
    Array.isArray(v.srs) &&
    typeof v.exportedAt === 'string'
  );
}

function parseBackup(json: string): BackupPayload {
  const parsed: unknown = JSON.parse(json);
  if (!isBackupPayload(parsed)) {
    throw new Error('Not a FlashCardZ backup (expected version 1 with decks, cards, srs).');
  }
  return parsed;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dbSize, setDbSize] = useState<string | null>(null);
  const [csvDecks, setCsvDecks] = useState<DeckWithCounts[]>([]);
  const [csvPickerVisible, setCsvPickerVisible] = useState(false);
  const [dailyGoal, setDailyGoalState] = useState(DEFAULT_DAILY_GOAL);
  const [reminderEnabled, setReminderEnabledState] = useState(false);
  const [reminderHour, setReminderHourState] = useState(DEFAULT_REMINDER_HOUR);
  // Ref mirrors for the steppers so rapid taps can't operate on stale
  // closures and drop increments (sync update runs before any await).
  const goalRef = useRef(DEFAULT_DAILY_GOAL);
  const hourRef = useRef(DEFAULT_REMINDER_HOUR);

  const loadPrefs = useCallback(async () => {
    const [h, g, rOn, rHour] = await Promise.all([
      AsyncStorage.getItem(HAPTICS_KEY),
      getDailyGoal().catch(() => DEFAULT_DAILY_GOAL),
      getReminderEnabled().catch(() => false),
      getReminderHour().catch(() => DEFAULT_REMINDER_HOUR),
    ]);
    if (h !== null) setHapticsEnabled(h === '1');
    goalRef.current = g;
    hourRef.current = rHour;
    setDailyGoalState(g);
    setReminderEnabledState(rOn);
    setReminderHourState(rHour);
  }, []);

  const loadDbSize = useCallback(async () => {
    try {
      const info = await FileSystem.getInfoAsync(db.databasePath);
      if (info.exists && 'size' in info && typeof info.size === 'number') {
        setDbSize(formatBytes(info.size));
      } else {
        setDbSize(null);
      }
    } catch {
      setDbSize(null);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void loadDbSize();
      // Prefs can change in the Stats tab (daily goal stepper shares the
      // same AsyncStorage keys), so re-read on every focus — this also
      // covers the initial mount.
      void loadPrefs();
    }, [loadDbSize, loadPrefs]),
  );

  const toggleHaptics = useCallback(async (next: boolean) => {
    setHapticsEnabled(next);
    await AsyncStorage.setItem(HAPTICS_KEY, next ? '1' : '0');
  }, []);

  const changeGoal = useCallback(async (delta: number) => {
    const next = clampGoal(goalRef.current + delta);
    goalRef.current = next;
    setDailyGoalState(next);
    await setDailyGoal(next);
  }, []);

  const toggleReminder = useCallback(async (next: boolean) => {
    setReminderEnabledState(next);
    await setReminderEnabled(next);
  }, []);

  const changeHour = useCallback(async (delta: number) => {
    const next = Math.min(23, Math.max(0, hourRef.current + delta));
    hourRef.current = next;
    setReminderHourState(next);
    await setReminderHour(next);
  }, []);

  const handleExport = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const payload = await exportData(db);
      const json = JSON.stringify(payload, null, 2);
      await AsyncStorage.setItem(LAST_BACKUP_KEY, json);

      const directory = FileSystem.documentDirectory;
      if (!directory) throw new Error('On-device storage directory is unavailable.');
      const fileName = `flashcardz-backup-${new Date().toISOString().slice(0, 10)}.json`;
      const uri = `${directory}${fileName}`;
      await FileSystem.writeAsStringAsync(uri, json);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/json',
          dialogTitle: 'Save FlashCardZ backup',
        });
      }
      Alert.alert(
        'Backup saved',
        `${payload.decks.length} decks, ${payload.cards.length} cards → ${fileName}`,
      );
    } catch (e) {
      Alert.alert('Export failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [db, busy]);

  const restoreFromJson = useCallback(
    async (json: string, source: string) => {
      const payload = parseBackup(json);
      await importData(db, payload);
      await loadDbSize();
      Alert.alert(
        'Import complete',
        `${payload.decks.length} decks, ${payload.cards.length} cards restored from ${source}.`,
      );
    },
    [db, loadDbSize],
  );

  const restoreSavedCopy = useCallback(async () => {
    const json = await AsyncStorage.getItem(LAST_BACKUP_KEY);
    if (!json) {
      Alert.alert('No backup', 'No on-device backup found yet. Export first.');
      return;
    }
    await restoreFromJson(json, 'saved copy');
  }, [restoreFromJson]);

  const handleImport = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });
      if (picked.canceled) {
        Alert.alert('No file chosen', 'Pick a backup file, or restore the saved on-device copy.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Restore saved copy', onPress: () => void restoreSavedCopy() },
        ]);
        return;
      }
      const asset = picked.assets[0];
      if (!asset) throw new Error('Document picker returned no file.');
      const json = await FileSystem.readAsStringAsync(asset.uri);
      await restoreFromJson(json, 'file');
    } catch (e) {
      Alert.alert('Import failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [busy, restoreFromJson, restoreSavedCopy]);

  const openCsvImport = useCallback(async () => {
    if (busy) return;
    try {
      const rows = await getDecksWithCounts(db);
      if (rows.length === 0) {
        Alert.alert('No decks', 'Create a deck first, then import cards into it.');
        return;
      }
      setCsvDecks(rows);
      setCsvPickerVisible(true);
    } catch (e) {
      Alert.alert('Could not load decks', e instanceof Error ? e.message : String(e));
    }
  }, [db, busy]);

  const importCsvToDeck = useCallback(
    async (deckId: string, deckTitle: string) => {
      setCsvPickerVisible(false);
      setBusy(true);
      try {
        const picked = await DocumentPicker.getDocumentAsync({
          type: ['text/csv', 'text/plain', 'text/comma-separated-values'],
          copyToCacheDirectory: true,
        });
        if (picked.canceled) return;
        const asset = picked.assets[0];
        if (!asset) throw new Error('Document picker returned no file.');
        const text = await FileSystem.readAsStringAsync(asset.uri);
        const { inserted } = await bulkCreateCards(db, deckId, parseBulkInput(text));
        await loadDbSize();
        Alert.alert(
          'Import complete',
          inserted > 0
            ? `${inserted} card${inserted === 1 ? '' : 's'} added to "${deckTitle}".`
            : `No valid card lines found (need "Front, Back" per line).`,
        );
      } catch (e) {
        Alert.alert('Import failed', e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [db, loadDbSize],
  );

  const handleClearDatabase = useCallback(() => {
    Alert.alert(
      'Erase everything?',
      'All decks, cards, and review history will be permanently deleted. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Erase',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await clearDatabase(db);
                await loadDbSize();
                Alert.alert('Done', 'Database cleared. Start fresh!');
              } catch (e) {
                Alert.alert('Clear failed', e instanceof Error ? e.message : String(e));
              }
            })();
          },
        },
      ],
    );
  }, [db, loadDbSize]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.inner}>
        <Text style={styles.heading}>Settings</Text>
        <Text style={styles.sub}>Backup, preferences & tools</Text>

        <Text style={styles.section}>DATA MANAGEMENT</Text>
        <View style={styles.card}>
          <Pressable
            onPress={() => void handleExport()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Export backup as JSON"
            style={({ pressed }) => [styles.outlineBtn, styles.emeraldOutline, { opacity: busy || pressed ? 0.7 : 1 }]}>
            <View style={[styles.iconTile, styles.emeraldTile]}>
              <Ionicons name="download" size={20} color={EMERALD} />
            </View>
            <View style={styles.btnText}>
              <Text style={styles.btnTitle}>Export Data (JSON)</Text>
              <Text style={styles.btnSub}>Save backup to device</Text>
            </View>
          </Pressable>

          <View style={styles.divider} />

          <Pressable
            onPress={() => void handleImport()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Import backup from JSON file"
            style={({ pressed }) => [styles.outlineBtn, styles.cyanOutline, { opacity: busy || pressed ? 0.7 : 1 }]}>
            <View style={[styles.iconTile, styles.cyanTile]}>
              <Ionicons name="cloud-upload" size={20} color={CYAN} />
            </View>
            <View style={styles.btnText}>
              <Text style={styles.btnTitle}>Import Data (JSON)</Text>
              <Text style={styles.btnSub}>Restore database from JSON file</Text>
            </View>
          </Pressable>

          <View style={styles.divider} />

          <Pressable
            onPress={() => void openCsvImport()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Bulk import cards from CSV file"
            style={({ pressed }) => [styles.solidBtn, { opacity: busy || pressed ? 0.8 : 1 }]}>
            <View style={styles.solidIconTile}>
              <Ionicons name="document-text" size={20} color="#fff" />
            </View>
            <View style={styles.btnText}>
              <Text style={styles.solidTitle}>Bulk CSV Deck Import</Text>
              <Text style={styles.solidSub}>Import cards from external CSV</Text>
            </View>
          </Pressable>
        </View>

        <Text style={styles.section}>PREFERENCES & STORAGE</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.btnText}>
              <Text style={styles.btnTitle}>Haptics feedback</Text>
              <Text style={styles.btnSub}>Vibration on flips & grades</Text>
            </View>
            <Switch value={hapticsEnabled} onValueChange={(v) => void toggleHaptics(v)} />
          </View>

          <View style={styles.divider} />

          <View style={styles.row}>
            <View style={[styles.iconTile, styles.neutralTile]}>
              <Ionicons name="server" size={20} color={MUTED} />
            </View>
            <View style={styles.btnText}>
              <Text style={styles.btnTitle}>Local database</Text>
              <Text style={styles.btnSub}>On-device SQLite storage</Text>
            </View>
            {dbSize == null ? (
              <ActivityIndicator size="small" color={MUTED} />
            ) : (
              <Text style={styles.sizeText}>{dbSize} used</Text>
            )}
          </View>
        </View>

        <Text style={styles.section}>STUDY GOALS & REMINDERS</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={[styles.iconTile, styles.neutralTile]}>
              <Ionicons name="flag" size={20} color={MUTED} />
            </View>
            <View style={styles.btnText}>
              <Text style={styles.btnTitle}>Daily goal</Text>
              <Text style={styles.btnSub}>
                {dailyGoal} reviews/day ({MIN_DAILY_GOAL}–{MAX_DAILY_GOAL})
              </Text>
            </View>
            <View style={styles.stepper}>
              <Pressable
                onPress={() => void changeGoal(-5)}
                disabled={dailyGoal <= MIN_DAILY_GOAL}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Decrease daily goal"
                style={[styles.stepBtn, { opacity: dailyGoal <= MIN_DAILY_GOAL ? 0.35 : 1 }]}>
                <Text style={styles.stepText}>−</Text>
              </Pressable>
              <Pressable
                onPress={() => void changeGoal(5)}
                disabled={dailyGoal >= MAX_DAILY_GOAL}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Increase daily goal"
                style={[styles.stepBtn, { opacity: dailyGoal >= MAX_DAILY_GOAL ? 0.35 : 1 }]}>
                <Text style={styles.stepText}>+</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.row}>
            <View style={[styles.iconTile, styles.neutralTile]}>
              <Ionicons name="notifications" size={20} color={MUTED} />
            </View>
            <View style={styles.btnText}>
              <Text style={styles.btnTitle}>Daily reminder</Text>
              <Text style={styles.btnSub}>Nudge on the Decks tab when due</Text>
            </View>
            <Switch value={reminderEnabled} onValueChange={(v) => void toggleReminder(v)} />
          </View>

          {reminderEnabled && (
            <>
              <View style={styles.divider} />
              <View style={styles.row}>
                <View style={styles.btnText}>
                  <Text style={styles.btnTitle}>Reminder after</Text>
                  <Text style={styles.btnSub}>
                    {reminderHour}:00 — banner shows if goal unmet
                  </Text>
                </View>
                <View style={styles.stepper}>
                  <Pressable
                    onPress={() => void changeHour(-1)}
                    disabled={reminderHour <= 0}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Earlier reminder hour"
                    style={[styles.stepBtn, { opacity: reminderHour <= 0 ? 0.35 : 1 }]}>
                    <Text style={styles.stepText}>−</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void changeHour(1)}
                    disabled={reminderHour >= 23}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Later reminder hour"
                    style={[styles.stepBtn, { opacity: reminderHour >= 23 ? 0.35 : 1 }]}>
                    <Text style={styles.stepText}>+</Text>
                  </Pressable>
                </View>
              </View>
            </>
          )}
        </View>

        <Pressable
          onPress={handleClearDatabase}
          accessibilityRole="button"
          accessibilityLabel="Erase all data"
          style={({ pressed }) => [styles.dangerBtn, { opacity: pressed ? 0.8 : 1 }]}>
          <View style={[styles.iconTile, styles.crimsonTile]}>
            <Ionicons name="trash" size={20} color={CRIMSON} />
          </View>
          <View style={styles.btnText}>
            <Text style={[styles.btnTitle, styles.dangerTitle]}>Reset All Data</Text>
            <Text style={styles.btnSub}>Erase decks, cards & history</Text>
          </View>
        </Pressable>

        <View style={styles.footer}>
          <View style={styles.brandMark}>
            <Ionicons name="flash" size={26} color={EMERALD} />
          </View>
          <View style={styles.versionPill}>
            <Text style={styles.versionText}>v{Constants.expoConfig?.version ?? '1.0.0'} (Production Ready)</Text>
          </View>
          <Text style={styles.copyright}>© 2026 FlashCardZ · MIT License</Text>
          <Text style={styles.copyright}>Offline-first · Private by design</Text>
        </View>
      </ScrollView>

      <Modal
        visible={csvPickerVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        transparent
        onRequestClose={() => setCsvPickerVisible(false)}>
        <View style={styles.sheetScrim}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Import into deck</Text>
            <FlatList
              data={csvDecks}
              keyExtractor={(d) => d.id}
              style={styles.sheetList}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => void importCsvToDeck(item.id, item.title)}
                  style={({ pressed }) => [styles.sheetRow, { opacity: pressed ? 0.7 : 1 }]}>
                  <Text style={styles.sheetRowTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.sheetRowSub}>
                    {item.totalCards} {item.totalCards === 1 ? 'card' : 'cards'}
                  </Text>
                </Pressable>
              )}
            />
            <Pressable
              onPress={() => setCsvPickerVisible(false)}
              style={styles.sheetCancel}>
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  inner: {
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.two,
  },
  heading: { color: INK, fontSize: 30, fontWeight: '800' },
  sub: { color: MUTED, fontSize: 14, marginTop: 2, marginBottom: Spacing.two },
  section: { color: MUTED, fontSize: 12, fontWeight: '800', letterSpacing: 1.5, marginTop: Spacing.three },
  card: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 20, padding: Spacing.three, gap: Spacing.one },
  divider: { height: 1, backgroundColor: BORDER, opacity: 0.6, marginVertical: Spacing.one },
  // Action buttons
  outlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    borderWidth: 1.5,
    borderRadius: 14,
    padding: Spacing.three,
  },
  emeraldOutline: { borderColor: EMERALD, backgroundColor: 'rgba(16, 185, 129, 0.06)' },
  cyanOutline: { borderColor: CYAN, backgroundColor: 'rgba(34, 211, 238, 0.06)' },
  solidBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    backgroundColor: VIOLET,
    borderRadius: 14,
    padding: Spacing.three,
    shadowColor: VIOLET,
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 6,
  },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emeraldTile: { backgroundColor: 'rgba(16, 185, 129, 0.12)', borderColor: EMERALD },
  cyanTile: { backgroundColor: 'rgba(34, 211, 238, 0.12)', borderColor: CYAN },
  neutralTile: { backgroundColor: 'rgba(148, 163, 184, 0.1)', borderColor: BORDER },
  crimsonTile: { backgroundColor: 'rgba(239, 68, 68, 0.12)', borderColor: CRIMSON },
  solidIconTile: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnText: { flex: 1, gap: 2 },
  btnTitle: { color: INK, fontSize: 16, fontWeight: '700' },
  btnSub: { color: MUTED, fontSize: 13 },
  solidTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  solidSub: { color: '#E9E4FF', fontSize: 13 },
  // Preference rows
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2, paddingVertical: Spacing.one },
  sizeText: { color: EMERALD, fontSize: 14, fontWeight: '800' },
  stepper: { flexDirection: 'row', gap: Spacing.two },
  stepBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: BORDER, backgroundColor: BG },
  stepText: { color: INK, fontSize: 18, fontWeight: '800' },
  // Danger zone
  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1.5,
    borderColor: CRIMSON,
    borderRadius: 14,
    padding: Spacing.three,
    marginTop: Spacing.two,
  },
  dangerTitle: { color: CRIMSON },
  // Footer
  footer: { alignItems: 'center', gap: Spacing.two, paddingTop: Spacing.four },
  brandMark: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: EMERALD,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: EMERALD,
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 6,
  },
  versionPill: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  versionText: { color: INK, fontSize: 12, fontWeight: '700' },
  copyright: { color: MUTED, fontSize: 12 },
  // Deck picker sheet
  sheetScrim: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: CARD,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    padding: Spacing.four,
    gap: Spacing.two,
    maxHeight: '70%',
  },
  sheetTitle: { color: INK, fontSize: 18, fontWeight: '800' },
  sheetList: { flexGrow: 0 },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingVertical: Spacing.two + 4,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  sheetRowTitle: { flex: 1, color: INK, fontSize: 16, fontWeight: '600' },
  sheetRowSub: { color: MUTED, fontSize: 13 },
  sheetCancel: { backgroundColor: BG, borderWidth: 1, borderColor: BORDER, borderRadius: 12, paddingVertical: Spacing.three, alignItems: 'center', marginTop: Spacing.two },
  sheetCancelText: { color: MUTED, fontSize: 16, fontWeight: '700' },
});
