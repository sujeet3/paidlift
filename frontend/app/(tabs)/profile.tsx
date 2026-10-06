import { View, Text, StyleSheet, Pressable, ScrollView, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { useUser } from "@/src/context/user";
import { colors, spacing, radius, type } from "@/src/theme";

export default function Profile() {
  const { user, signOut } = useUser();
  if (!user) return null;

  const handleSignOut = () => {
    Alert.alert("Sign out?", "You'll need to verify OTP again to sign back in.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/onboarding");
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl }}>
        <View style={styles.avatarBlock}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(user.name || "U").slice(0, 1).toUpperCase()}</Text>
          </View>
          <Text style={styles.name}>{user.name}</Text>
          <Text style={styles.phone}>{user.phone}</Text>
          {user.aadhaar_verified && (
            <View style={styles.verified} testID="profile-verified-badge">
              <Ionicons name="shield-checkmark" size={13} color={colors.success} />
              <Text style={styles.verifiedText}>Aadhaar verified · ends in {user.aadhaar_last4}</Text>
            </View>
          )}
          <View style={styles.rating}>
            <Ionicons name="star" size={14} color={colors.warning} />
            <Text style={styles.ratingText}>
              {user.rating_avg ? user.rating_avg.toFixed(1) : "New"} · {user.rating_count} ratings
            </Text>
          </View>
        </View>

        <Section title="Account">
          <Row icon="car" label="My Vehicles" onPress={() => router.push("/vehicles")} testID="row-vehicles" />
          <Row icon="wallet" label="Wallet" onPress={() => router.push("/(tabs)/wallet")} testID="row-wallet" />
          <Row icon="reader" label="Ride History" onPress={() => router.push("/(tabs)/rides")} testID="row-history" />
        </Section>

        <Section title="Safety">
          <Row icon="warning" label="SOS / Emergency" iconColor={colors.error} onPress={() => router.push("/sos")} testID="row-sos" />
        </Section>

        <Section title="More">
          <Row icon="shield-checkmark" label="Admin panel" onPress={() => router.push("/admin")} testID="row-admin" />
          <Row icon="information-circle" label="About PAID LIFT" onPress={() => Alert.alert("PAID LIFT", "Peer-to-peer ride-sharing for India.\nVersion 1.0 (MVP)")} testID="row-about" />
          <Row icon="log-out" label="Sign out" onPress={handleSignOut} iconColor={colors.error} testID="row-signout" />
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: any) {
  return (
    <View style={{ marginTop: spacing.xl }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function Row({ icon, label, onPress, iconColor, testID }: any) {
  return (
    <Pressable style={styles.row} onPress={onPress} testID={testID}>
      <Ionicons name={icon} size={20} color={iconColor || colors.brandPrimary} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  avatarBlock: { alignItems: "center", paddingTop: spacing.lg },
  avatar: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontSize: 32, fontWeight: "800" },
  name: { ...type.h2, marginTop: spacing.md },
  phone: { ...type.bodySm, marginTop: 2 },
  verified: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#E8F5E9",
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    marginTop: spacing.sm,
  },
  verifiedText: { fontSize: 11, color: colors.success, fontWeight: "700" },
  rating: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.sm },
  ratingText: { fontSize: 12, color: colors.onSurfaceSecondary, fontWeight: "600" },
  sectionTitle: { ...type.label, marginBottom: spacing.sm },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  rowLabel: { flex: 1, fontSize: 15, color: colors.onSurface, fontWeight: "600" },
});
