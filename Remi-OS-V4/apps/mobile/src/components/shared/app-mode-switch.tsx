import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useAppModeStore, type AppMode } from "@/src/stores/app-mode";

type Props = {
  /** Shown on technician login — switches to customer app entry */
  targetMode: AppMode;
  label: string;
};

export function AppModeSwitch({ targetMode, label }: Props) {
  const router = useRouter();
  const setMode = useAppModeStore((s) => s.setMode);

  return (
    <View style={styles.wrap}>
      <Pressable
        style={styles.btn}
        onPress={async () => {
          await setMode(targetMode);
          if (targetMode === "customer") {
            router.replace("/customer/welcome");
          } else {
            router.replace("/login");
          }
        }}
      >
        <Text style={styles.text}>{label}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 24, alignItems: "center" },
  btn: { paddingVertical: 10, paddingHorizontal: 16 },
  text: { fontSize: 15, color: "#6B7280", fontWeight: "500" },
});
