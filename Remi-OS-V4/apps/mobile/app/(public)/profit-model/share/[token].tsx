// PM-6 — Deep-link landing for `remi://profit-model/share/:token`. We fetch
// the session here (no auth required — the share token IS the credential),
// stash it in the pending Zustand store, and replace navigation onto the
// calculator screen so the back button doesn't bounce the user back into a
// loader. The handoff is intentionally store-based instead of URL params: the
// `inputs` blob can be many KB, far past what's safe to round-trip through
// query strings.

import { useEffect } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useProfitSession } from "@technician/hooks/profit-calculator/use-profit-sessions";
import { useProfitModelDraftStore } from "@technician/stores/profit-model-draft-store";

export default function SharedProfitModelScreen() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token: string }>();
  const tokenStr = typeof token === "string" ? token : null;

  const setPending = useProfitModelDraftStore((s) => s.setPending);
  const query = useProfitSession(tokenStr);

  useEffect(() => {
    if (query.data) {
      setPending(query.data);
      router.replace("/(public)/profit-calculator");
    }
  }, [query.data, setPending, router]);

  if (!tokenStr) {
    return (
      <ErrorState
        title="Invalid share link"
        body="This profit-model link is missing its token."
        onRetry={null}
        onClose={() => router.replace("/(public)/profit-calculator")}
      />
    );
  }

  if (query.isError) {
    return (
      <ErrorState
        title="Couldn't load this scenario"
        body="The link may have expired or been deleted."
        onRetry={() => query.refetch()}
        onClose={() => router.replace("/(public)/profit-calculator")}
      />
    );
  }

  return (
    <View style={styles.center}>
      <ActivityIndicator color="#3B82F6" size="large" />
      <Text style={styles.loadingText}>Loading shared scenario…</Text>
    </View>
  );
}

function ErrorState({
  title,
  body,
  onRetry,
  onClose,
}: {
  title: string;
  body: string;
  onRetry: (() => void) | null;
  onClose: () => void;
}) {
  return (
    <View style={styles.center}>
      <MaterialIcons name="error-outline" size={36} color="#EF4444" />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      <View style={styles.actions}>
        {onRetry ? (
          <Pressable style={styles.primary} onPress={onRetry}>
            <Text style={styles.primaryText}>Retry</Text>
          </Pressable>
        ) : null}
        <Pressable style={styles.secondary} onPress={onClose}>
          <Text style={styles.secondaryText}>Open calculator</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
    backgroundColor: "#F9FAFB",
  },
  loadingText: { color: "#6B7280", fontSize: 14 },
  title: { fontSize: 17, fontWeight: "700", color: "#111827" },
  body: { fontSize: 13, color: "#6B7280", textAlign: "center", lineHeight: 18 },
  actions: { flexDirection: "row", gap: 8, marginTop: 8 },
  primary: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#3B82F6",
  },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  secondary: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
  },
  secondaryText: { color: "#374151", fontWeight: "700", fontSize: 14 },
});
