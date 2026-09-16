/**
 * BulkImportModal — paste tab/comma-separated lines to batch-create cards.
 *
 * Accepted per line: `Front <TAB> Back` or `Front, Back`
 * (comma splitting respects double-quoted fields).
 * Insert runs through `bulkCreateCards`: one SQLite transaction with
 * explicit prepared statements.
 */

import { useSQLiteContext } from 'expo-sqlite';
import { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { bulkCreateCards, type BulkCardInput } from '@/db/database';
import { playNotification } from '@/lib/haptics';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';

/** Split a line on commas, respecting "double-quoted" fields. */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields.map((f) => f.trim().replace(/^"|"$/g, ''));
}

/**
 * Parse pasted text into card pairs. Tab takes precedence per line;
 * otherwise comma-split. Lines without two non-empty fields are skipped.
 */
export function parseBulkInput(text: string): BulkCardInput[] {
  const pairs: BulkCardInput[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    let front = '';
    let back = '';
    if (line.includes('\t')) {
      const [f, ...rest] = line.split('\t');
      front = (f ?? '').trim();
      back = rest.join('\t').trim();
    } else {
      const fields = splitCsvLine(line);
      if (fields.length < 2) continue;
      front = fields[0] ?? '';
      back = fields.slice(1).join(', ').trim();
    }
    if (front && back) pairs.push({ front, back });
  }
  return pairs;
}

interface BulkImportModalProps {
  visible: boolean;
  deckId: string;
  onClose: () => void;
  /** Called with the inserted count so the parent can refresh. */
  onImported: (inserted: number) => void;
}

export default function BulkImportModal({ visible, deckId, onClose, onImported }: BulkImportModalProps) {
  const db = useSQLiteContext();
  const theme = useTheme();
  // Fresh per mount — the parent remounts via `key` on each open.
  const [text, setText] = useState('');
  const [importing, setImporting] = useState(false);

  const pairs = useMemo(() => parseBulkInput(text), [text]);
  const canImport = pairs.length > 0 && !importing;

  const handleImport = async (): Promise<void> => {
    if (!canImport) return;
    setImporting(true);
    try {
      const { inserted } = await bulkCreateCards(db, deckId, pairs);
      await playNotification();
      onImported(inserted);
      onClose();
    } catch (e) {
      Alert.alert('Import failed', e instanceof Error ? e.message : String(e));
      setImporting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={[styles.cancel, { color: theme.textSecondary }]}>Cancel</Text>
          </Pressable>
          <Text style={[styles.title, { color: theme.text }]}>Bulk Import</Text>
          <Pressable onPress={() => void handleImport()} disabled={!canImport} hitSlop={12}>
            <Text style={[styles.save, { color: theme.text, opacity: canImport ? 1 : 0.35 }]}>
              {importing ? 'Importing…' : `Import${pairs.length > 0 ? ` (${pairs.length})` : ''}`}
            </Text>
          </Pressable>
        </View>

        <View style={styles.form}>
          <Text style={[styles.hint, { color: theme.textSecondary }]}>
            One card per line: {'Front<TAB>Back'} or {'Front, Back'}
          </Text>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={'Bonjour\tHello\nGracias, Thank you'}
            placeholderTextColor={theme.textSecondary}
            multiline
            autoFocus
            style={[
              styles.input,
              {
                color: theme.text,
                backgroundColor: theme.backgroundElement,
                borderColor: theme.backgroundSelected,
              },
            ]}
          />
          {text.trim().length > 0 && (
            <Text style={[styles.preview, { color: theme.textSecondary }]}>
              {pairs.length === 0
                ? 'No valid lines yet — need front + back per line.'
                : `${pairs.length} card${pairs.length === 1 ? '' : 's'} ready to import.`}
            </Text>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: Spacing.six },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.two,
  },
  title: { fontSize: 17, fontWeight: '700' },
  cancel: { fontSize: 16 },
  save: { fontSize: 16, fontWeight: '700' },
  form: { flex: 1, gap: Spacing.two, paddingHorizontal: Spacing.four, paddingTop: Spacing.two },
  hint: { fontSize: 13 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 15,
    minHeight: 220,
    textAlignVertical: 'top',
  },
  preview: { fontSize: 13 },
});
