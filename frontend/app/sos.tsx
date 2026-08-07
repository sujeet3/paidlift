import { useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { api } from "@/src/api";
import { useUser } from "@/src/context/user";
import { colors, spacing, radius, type } from "@/src/theme";

export default function SOS() {
  const { user } = useUser();
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!user) return;
    setSending(true);
    try {
      await api.sos({ booking_id: "manual", user_id: user.id, location: "Manual SOS" });
      Alert.alert("SOS Sent", "Our team has been notified. Emergency contacts will be called.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert("Failed", e.message);
    }
    setSending(false);
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></Pressable>
        <Text style={styles.title}>Emergency SOS</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <Ionicons name="warning" size={72} color={colors.error} />
        </View>
        <Text style={styles.headline}>Are you in trouble?</Text>
        <Text style={styles.p}>
          Pressing SOS will alert our safety team, share your live location, and notify your emergency contacts.
        </Text>

        <Pressable style={styles.sosBtn} onPress={send} disabled={sending} testID="send-sos-button">
          {sending ? <ActivityIndicator color="#fff" /> : (
            <>
              <Ionicons name="alert-circle" size={22} color="#fff" />
              <Text style={styles.sosText}>Send Emergency Alert</Text>
            </>
          )}
        </Pressable>

        <View style={styles.tipCard}>
          <Ionicons name="information-circle" size={18} color={colors.info} />
          <Text style={styles.tip}>You can also long-press the SOS button on the home screen from any ride.</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", padding: spacing.lg, gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  backBtn: { padding: 4 },
  title: { ...type.h2 },
  body: { flex: 1, padding: spacing.xl, alignItems: "center", justifyContent: "center" },
  iconWrap: { width: 140, height: 140, borderRadius: 70, backgroundColor: "#FFEBEE", alignItems: "center", justifyContent: "center" },
  headline: { ...type.h1, marginTop: spacing.xl },
  p: { ...type.bodySm, textAlign: "center", marginTop: spacing.sm, lineHeight: 20 },
  sosBtn: { marginTop: spacing.xxl, flexDirection: "row", gap: 10, backgroundColor: colors.error, borderRadius: radius.md, paddingVertical: 18, paddingHorizontal: spacing.xl, alignItems: "center" },
  sosText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  tipCard: { flexDirection: "row", gap: 6, backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, marginTop: spacing.xl },
  tip: { flex: 1, fontSize: 12, color: colors.onSurfaceSecondary },
});
