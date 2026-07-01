import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Theme } from '@customer/constants/colors';
import { useSubmitRating } from '@customer/hooks/payments/use-ratings';

type RatingTier = 'great' | 'okay' | 'bad' | null;

const PRAISE_TAGS = ['Punctual', 'Professional', 'Thorough', 'Friendly'] as const;
const ISSUE_TAGS = ['Late', 'Messy', 'Incomplete', 'Rude'] as const;

export default function RatingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const submitRating = useSubmitRating();
  const [tier, setTier] = useState<RatingTier>(null);
  const [praise, setPraise] = useState<Set<string>>(new Set());
  const [issues, setIssues] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');

  const togglePraise = (tag: string) => {
    setPraise((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  const toggleIssue = (tag: string) => {
    setIssues((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  const submit = async () => {
    if (!tier || !id) return;
    const tierMap = { great: 'great', okay: 'okay', bad: 'not_good' } as const;
    const tags = tier === 'great'
      ? [...praise]
      : tier === 'bad'
        ? [...issues]
        : [];
    try {
      await submitRating.mutateAsync({
        appointmentId: Number(id),
        tier: tierMap[tier],
        tags,
        comment: note.trim() || undefined,
      });
      if (tier === 'great') {
        Alert.alert(
          'Thank you!',
          'Would you like to leave us a Google review?',
          [
            { text: 'Not Now', onPress: () => router.back() },
            {
              text: 'Leave Review',
              onPress: () => {
                Linking.openURL('https://g.page/review');
                router.back();
              },
            },
          ],
        );
      } else {
        router.back();
      }
    } catch {
      Alert.alert('Error', 'Could not submit your rating. Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.lead}>How was your visit?</Text>
        <Text style={styles.sub}>Appointment #{id}</Text>

        <View style={styles.emojiRow}>
          <TouchableOpacity
            style={[styles.emojiBtn, tier === 'great' && styles.emojiBtnSelected]}
            onPress={() => setTier('great')}
            activeOpacity={0.85}
          >
            <Text style={styles.emoji}>😀</Text>
            <Text style={[styles.emojiLabel, { color: Theme.colors.success }]}>Great</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.emojiBtn, tier === 'okay' && styles.emojiBtnSelected]}
            onPress={() => setTier('okay')}
            activeOpacity={0.85}
          >
            <Text style={styles.emoji}>😐</Text>
            <Text style={[styles.emojiLabel, { color: Theme.colors.warning }]}>Okay</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.emojiBtn, tier === 'bad' && styles.emojiBtnSelected]}
            onPress={() => setTier('bad')}
            activeOpacity={0.85}
          >
            <Text style={styles.emoji}>😞</Text>
            <Text style={[styles.emojiLabel, { color: Theme.colors.error }]}>Not Good</Text>
          </TouchableOpacity>
        </View>

        {tier === 'great' ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>What stood out?</Text>
            <View style={styles.pillRow}>
              {PRAISE_TAGS.map((tag) => {
                const on = praise.has(tag);
                return (
                  <TouchableOpacity
                    key={tag}
                    style={[styles.pill, on && styles.pillOn]}
                    onPress={() => togglePraise(tag)}
                  >
                    <Text style={[styles.pillText, on && styles.pillTextOn]}>{tag}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => Linking.openURL('https://g.page/review')}
              activeOpacity={0.85}
            >
              <Text style={styles.secondaryBtnText}>Leave a Google Review</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {tier === 'okay' ? (
          <View style={styles.block}>
            <Text style={styles.feedbackThanks}>Thanks for your feedback.</Text>
            <Text style={styles.blockTitle}>Anything we should know? (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Share more detail…"
              placeholderTextColor={Theme.colors.textTertiary}
              value={note}
              onChangeText={setNote}
              multiline
            />
          </View>
        ) : null}

        {tier === 'bad' ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>What went wrong?</Text>
            <View style={styles.pillRow}>
              {ISSUE_TAGS.map((tag) => {
                const on = issues.has(tag);
                return (
                  <TouchableOpacity
                    key={tag}
                    style={[styles.pill, on && styles.pillOnBad]}
                    onPress={() => toggleIssue(tag)}
                  >
                    <Text style={[styles.pillText, on && styles.pillTextOnBad]}>{tag}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.reachOut}>A team member will reach out.</Text>
            <Text style={styles.blockTitle}>Tell us more (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="We read every note…"
              placeholderTextColor={Theme.colors.textTertiary}
              value={note}
              onChangeText={setNote}
              multiline
            />
          </View>
        ) : null}

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.primaryBtn, (!tier || submitRating.isPending) && styles.primaryBtnDisabled]}
            onPress={submit}
            disabled={!tier || submitRating.isPending}
            activeOpacity={0.9}
          >
            {submitRating.isPending ? (
              <ActivityIndicator color={Theme.colors.white} />
            ) : (
              <Text style={styles.primaryBtnText}>Submit</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.back()} style={styles.skipBtn}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  scroll: {
    padding: Theme.spacing.lg,
    paddingBottom: Theme.spacing.xxl,
  },
  lead: {
    fontSize: Theme.fontSize.xxl,
    fontWeight: '700',
    color: Theme.colors.text,
    textAlign: 'center',
  },
  sub: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textTertiary,
    textAlign: 'center',
    marginTop: Theme.spacing.xs,
    marginBottom: Theme.spacing.lg,
  },
  emojiRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Theme.spacing.sm,
    marginBottom: Theme.spacing.lg,
  },
  emojiBtn: {
    flex: 1,
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    paddingVertical: Theme.spacing.lg,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Theme.colors.border,
  },
  emojiBtnSelected: {
    borderColor: Theme.colors.primary,
    ...Theme.shadow.md,
  },
  emoji: {
    fontSize: 40,
    marginBottom: Theme.spacing.xs,
  },
  emojiLabel: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
  },
  block: {
    marginBottom: Theme.spacing.lg,
  },
  blockTitle: {
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: Theme.colors.text,
    marginBottom: Theme.spacing.sm,
  },
  feedbackThanks: {
    fontSize: Theme.fontSize.md,
    color: Theme.colors.textSecondary,
    marginBottom: Theme.spacing.md,
    lineHeight: 22,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Theme.spacing.sm,
    marginBottom: Theme.spacing.md,
  },
  pill: {
    paddingVertical: Theme.spacing.sm,
    paddingHorizontal: Theme.spacing.md,
    borderRadius: Theme.borderRadius.full,
    backgroundColor: Theme.colors.surface,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  pillOn: {
    backgroundColor: Theme.colors.success + '18',
    borderColor: Theme.colors.success,
  },
  pillOnBad: {
    backgroundColor: Theme.colors.error + '15',
    borderColor: Theme.colors.error,
  },
  pillText: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.text,
    fontWeight: '500',
  },
  pillTextOn: {
    color: Theme.colors.success,
  },
  pillTextOnBad: {
    color: Theme.colors.error,
  },
  secondaryBtn: {
    backgroundColor: Theme.colors.surface,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    paddingVertical: Theme.spacing.md,
    borderRadius: Theme.borderRadius.md,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: Theme.colors.primary,
  },
  reachOut: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    marginBottom: Theme.spacing.md,
  },
  input: {
    borderWidth: 1,
    borderColor: Theme.colors.border,
    borderRadius: Theme.borderRadius.md,
    padding: Theme.spacing.md,
    minHeight: 96,
    textAlignVertical: 'top',
    fontSize: Theme.fontSize.md,
    color: Theme.colors.text,
    backgroundColor: Theme.colors.surfaceElevated,
  },
  actions: {
    marginTop: Theme.spacing.md,
    gap: Theme.spacing.sm,
  },
  primaryBtn: {
    backgroundColor: Theme.colors.primary,
    paddingVertical: Theme.spacing.md,
    borderRadius: Theme.borderRadius.md,
    alignItems: 'center',
  },
  primaryBtnDisabled: {
    opacity: 0.45,
  },
  primaryBtnText: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
  },
  skipBtn: {
    paddingVertical: Theme.spacing.sm,
    alignItems: 'center',
  },
  skipText: {
    fontSize: Theme.fontSize.md,
    color: Theme.colors.textSecondary,
    fontWeight: '500',
  },
});
