/**
 * FlashcardView — Reanimated 3D flip card.
 *
 * Driven by a parent-owned `flipped` shared value (0 = front, 1 = back)
 * so the review screen can reset it imperatively on grade. Front face
 * interpolates rotateY 0° → 180°, back face 180° → 360°, both with
 * `backfaceVisibility: 'hidden'` inside a `perspective: 1000` container.
 * All animation work stays on the UI thread (shared value +
 * `useAnimatedStyle`); tapping fires a light haptic (JS side, fire-and-forget).
 */

import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { playImpact } from '@/lib/haptics';
import { Spacing } from '@/constants/theme';

const BG = '#0F172A';
const SURFACE = '#1E293B';
const SURFACE_TINT = '#1C2B25';
const BORDER = '#334155';
const INK = '#F8FAFC';
const ANSWER_INK = '#E2E8F0';
const MUTED = '#94A3B8';
const EMERALD = '#10B981';

const FLIP_DURATION_MS = 300;

/**
 * Module-scope so the compiler's immutability rule (which forbids mutating
 * hook/prop values inside components) doesn't flag Reanimated's designed
 * imperative `.value` writes. Shared values are stable mutable containers,
 * like refs — writing them never re-renders.
 */
function animateFlipTo(flipped: SharedValue<number>, next: 0 | 1): void {
  flipped.value = withTiming(next, { duration: FLIP_DURATION_MS });
}

interface FlashcardViewProps {
  front: string;
  back: string;
  /** 0 = showing front, 1 = showing back. Owned by the parent. */
  flipped: SharedValue<number>;
  /** Mirrors flip state to the JS thread (e.g. to reveal grade buttons). */
  onFlipChange?: (isFlipped: boolean) => void;
}

export default function FlashcardView({ front, back, flipped, onFlipChange }: FlashcardViewProps) {
  // UI thread: front rotates 0° -> 180°.
  const frontStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1000 },
      { rotateY: `${interpolate(flipped.value, [0, 1], [0, 180])}deg` },
    ],
  }));

  // UI thread: back rotates 180° -> 360° so it lands upright when flipped.
  const backStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1000 },
      { rotateY: `${interpolate(flipped.value, [0, 1], [180, 360])}deg` },
    ],
  }));

  const toggle = useCallback(() => {
    const next: 0 | 1 = flipped.value > 0.5 ? 0 : 1;
    animateFlipTo(flipped, next);
    onFlipChange?.(next === 1);
    void playImpact();
  }, [flipped, onFlipChange]);

  return (
    <Pressable
      onPress={toggle}
      accessibilityRole="button"
      accessibilityLabel={flipped.value > 0.5 ? 'Show question' : 'Show answer'}>
      <View style={styles.stage}>
        <Animated.View style={[styles.face, frontStyle]}>
          <View style={styles.tag}>
            <Text style={styles.tagText}>QUESTION</Text>
          </View>
          <Text style={styles.frontText}>{front}</Text>
        </Animated.View>
        <Animated.View style={[styles.face, styles.faceBack, backStyle]}>
          <View style={[styles.tag, styles.tagAnswer]}>
            <Text style={[styles.tagText, styles.tagAnswerText]}>ANSWER</Text>
          </View>
          <Text style={styles.backText}>{back}</Text>
        </Animated.View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stage: {
    minHeight: 300,
    backgroundColor: BG,
  },
  face: {
    backgroundColor: SURFACE,
    borderColor: BORDER,
    borderWidth: 1.5,
    borderRadius: 24,
    padding: Spacing.four,
    paddingTop: Spacing.five,
    gap: Spacing.two,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 300,
    backfaceVisibility: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  faceBack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: SURFACE_TINT,
    borderColor: 'rgba(16, 185, 129, 0.45)',
  },
  tag: {
    position: 'absolute',
    top: Spacing.three,
    left: Spacing.three,
    backgroundColor: 'rgba(148, 163, 184, 0.14)',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: {
    color: MUTED,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  tagAnswer: {
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
    borderColor: EMERALD,
  },
  tagAnswerText: {
    color: EMERALD,
  },
  frontText: {
    color: INK,
    fontSize: 23,
    fontWeight: '700',
    lineHeight: 32,
    textAlign: 'center',
  },
  backText: {
    color: ANSWER_INK,
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 30,
    textAlign: 'center',
  },
});
