/**
 * `/pending-reality/help` — in-app walkthrough for the Pending
 * Reality experience.
 *
 * PR 3 (item #6, 2026-04-24): the review screen had no in-product
 * explainer, so a first-time user landing there from the FAB or HUD
 * had no idea what they were looking at. This screen renders a
 * scrollable plain-text walkthrough — the same content lives in
 * `docs/Pending-Reality-Walkthrough.md` for reviewers / docs
 * consumers; the markdown doc is the canonical authoring surface
 * and this screen is its in-app twin.
 *
 * We render the body as a list of typed sections (heading + body
 * paragraphs + optional bullet list) rather than parsing markdown
 * at runtime. This keeps the bundle lean (no markdown renderer
 * dependency) and lets the design tokens come from the existing
 * `StyleSheet`.
 *
 * If the markdown changes, mirror the edits here. The two files are
 * deliberately twin-authored so the agent updating either one
 * remembers the other (the markdown calls this out in its preamble).
 */

import { Stack, useRouter } from "expo-router";
import { useCallback } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

interface Section {
  heading: string;
  body?: string[];
  bullets?: { label: string; value: string }[];
}

const SECTIONS: Section[] = [
  {
    heading: "What is Pending Reality?",
    body: [
      "Pending Reality is the staging area for changes you propose to your calendar before they actually commit. Think of it as a 'what-if' layer painted on top of your real schedule: nothing on the canvas moves until you finalize, so you can drag, swap, cancel, and reassign freely without anyone seeing the change.",
      "Without Pending Reality, every drag was a commit. With it, you can stage as many changes as you want, see them as a coherent diff against the live calendar, and commit when the whole batch makes sense.",
    ],
  },
  {
    heading: "Where you see it",
    body: [
      "FAB — bottom-right of the calendar tab. Appears the moment your session has at least one staged change. Tap it to open this review screen.",
      "HUD — top-right pill under the toolbar. Same destination as the FAB, shipped as a backup because the avatar strip can hide the FAB in landscape.",
      "Pending tint — every appointment with a staged change gets a thin yellow border on the canvas. Tap it to jump straight to its card on the review screen.",
    ],
  },
  {
    heading: "The review screen",
    body: [
      "Final state — the default tab. One card per change, grouped by the appointment it targets. Subject line is the customer name; detail line is the post-commit projection. Tap a card to open the underlying appointment detail.",
      "Sequence of operations — the same intents, ordered by the commit pipeline (cancellations → reschedules → reassigns → creates → personal events). Use this when something looks wrong on Final state and you need to know which intent to remove or modify.",
      "AI tab (franchise-owner only) — suggestions from the optimizer engine awaiting your approval. Per the trust gradient, AI never auto-commits.",
    ],
  },
  {
    heading: "The bottom action bar",
    bullets: [
      {
        label: "Cancel session",
        value:
          "Cancels the session on the server and discards every staged intent. The calendar is unaffected — you're throwing away your draft.",
      },
      {
        label: "Finalize",
        value:
          "Sends the whole session to the backend. You'll see one of three outcomes: Committed (everything landed), Submitted for review (FO approval needed), or Rejected (linter caught a conflict — fix and retry).",
      },
    ],
  },
  {
    heading: "Linter issues and Auto-Fix",
    body: [
      "When the linter spots a problem (time conflict, SLA violation, tech without the right service qualification) it shows up beneath the affected card.",
      "If the issue has a known auto-fix, the card has an Apply auto-fix button. Tapping it dispatches the suggested replacement intent and re-validates.",
      "Manual fixes (swap two appointments, move a third) are done by tapping Modify or Remove and re-authoring on the calendar.",
    ],
  },
  {
    heading: "What it is not",
    bullets: [
      {
        label: "Not autosaved on the server",
        value:
          "Drafts live on this device until you finalize. Uninstall or wipe storage mid-session and the draft is gone.",
      },
      {
        label: "Not multi-user",
        value:
          "Each device composes its own draft. Two technicians composing simultaneously won't see each other's work.",
      },
      {
        label: "Not a revert mechanism",
        value:
          "Once a session commits, the new state is the real calendar. To undo, re-author with the inverse change.",
      },
    ],
  },
];

export default function PendingRealityHelpScreen() {
  const router = useRouter();
  const handleClose = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  }, [router]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "About Pending Reality" }} />
      <ScrollView
        contentContainerStyle={styles.content}
        testID="pending-reality-help-scroll"
      >
        {SECTIONS.map((section) => (
          <View key={section.heading} style={styles.section}>
            <Text style={styles.sectionHeading}>{section.heading}</Text>
            {section.body?.map((paragraph, idx) => (
              <Text key={idx} style={styles.paragraph}>
                {paragraph}
              </Text>
            ))}
            {section.bullets ? (
              <View style={styles.bulletList}>
                {section.bullets.map((item) => (
                  <View key={item.label} style={styles.bulletRow}>
                    <Text style={styles.bulletLabel}>{item.label}</Text>
                    <Text style={styles.bulletValue}>{item.value}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ))}

        <Pressable
          onPress={handleClose}
          accessibilityRole="button"
          testID="pending-reality-help-close"
          style={({ pressed }) => [
            styles.closeBtn,
            pressed && styles.closeBtnPressed,
          ]}
        >
          <Text style={styles.closeBtnText}>Got it</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
  },
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 16,
  },
  section: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 16,
    gap: 8,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  paragraph: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
  },
  bulletList: {
    gap: 10,
    marginTop: 4,
  },
  bulletRow: {
    gap: 2,
  },
  bulletLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
  },
  bulletValue: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
  },
  closeBtn: {
    marginTop: 8,
    backgroundColor: "#111827",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    alignItems: "center",
  },
  closeBtnPressed: {
    opacity: 0.85,
  },
  closeBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
});
