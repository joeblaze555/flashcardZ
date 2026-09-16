/**
 * CardModal — reusable create/edit flashcard modal.
 *
 * - Create: inserts into `cards` + initializes `card_srs`
 *   (interval 0, repetition 0, easeFactor 2.5, dueDate now) via `createCard`.
 * - Edit: updates `front`/`back` only via `updateCard` — SRS progress kept.
 * - Fires haptic feedback on successful save (unless disabled in Settings).
 *
 * Form state is initialized from props; the parent remounts via `key` on
 * each open so the form always starts fresh (no reset effects needed).
 */

import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
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

import { createCard, updateCard } from '@/db/database';
import { playSelection } from '@/lib/haptics';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';

export interface EditingCard {
  id: string;
  front: string;
  back: string;
}

interface CardModalProps {
  visible: boolean;
  deckId: string;
  /** When set, the modal edits this card; otherwise it creates a new one. */
  editing?: EditingCard | null;
  onClose: () => void;
  /** Called after a successful save so the parent can refresh its list. */
  onSaved: () => void;
}

export default function CardModal({ visible, deckId, editing, onClose, onSaved }: CardModalProps) {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [front, setFront] = useState(editing?.front ?? '');
  const [back, setBack] = useState(editing?.back ?? '');
  const [saving, setSaving] = useState(false);

  const isEditing = editing != null;

  const canSave = front.trim().length > 0 && back.trim().length > 0 && !saving;

  const handleSave = async (): Promise<void> => {
    if (!canSave) return;
    setSaving(true);
    try {
      if (isEditing && editing) {
        await updateCard(db, editing.id, { front, back });
      } else {
        await createCard(db, { deckId, front, back });
      }
      await playSelection();
      onSaved();
      onClose();
    } catch (e) {
      Alert.alert('Could not save card', e instanceof Error ? e.message : String(e));
      setSaving(false);
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
          <Text style={[styles.title, { color: theme.text }]}>
            {isEditing ? 'Edit Card' : 'New Card'}
          </Text>
          <Pressable onPress={() => void handleSave()} disabled={!canSave} hitSlop={12}>
            <Text
              style={[
                styles.save,
                { color: theme.text, opacity: canSave ? 1 : 0.35 },
              ]}>
              {saving ? 'Saving…' : 'Save'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.form}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>FRONT</Text>
          <TextInput
            value={front}
            onChangeText={setFront}
            placeholder="Question or prompt…"
            placeholderTextColor={theme.textSecondary}
            multiline
            autoFocus={!isEditing}
            style={[
              styles.input,
              {
                color: theme.text,
                backgroundColor: theme.backgroundElement,
                borderColor: theme.backgroundSelected,
              },
            ]}
          />

          <Text style={[styles.label, { color: theme.textSecondary }]}>BACK</Text>
          <TextInput
            value={back}
            onChangeText={setBack}
            placeholder="Answer or explanation…"
            placeholderTextColor={theme.textSecondary}
            multiline
            style={[
              styles.input,
              styles.backInput,
              {
                color: theme.text,
                backgroundColor: theme.backgroundElement,
                borderColor: theme.backgroundSelected,
              },
            ]}
          />
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
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 1, marginTop: Spacing.two },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
    minHeight: 110,
    textAlignVertical: 'top',
  },
  backInput: { minHeight: 150 },
});
