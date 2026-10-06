import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Alert, Share, TextInput, Modal, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { api } from "@/src/api";
import { useUser } from "@/src/context/user";
import { colors, spacing, radius, type } from "@/src/theme";

export default function Profile() {
  const { user, signOut, refresh } = useUser();
  const [referralOpen, setReferralOpen] = useState(false);
  const [refCode, setRefCode] = useState("");
  const [subscribing, setSubscribing] = useState(false);
  if (!user) return null;

  const badges: any[] = (user as any).badges || [];
  const dpActive = (user as any).driver_plus_active;
  const dp = (user as any).driver_plus || {};

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

  const shareReferral = async () => {
    try {
      await Share.share({
        message: `🚗 Join PAID LIFT with my code ${user.referral_code} and get ₹50 wallet credit after your first ride! Download & sign up: share rides, split costs.`,
      });
    } catch {}
  };

  const applyCode = async () => {
    if (!refCode.trim()) return;
    try {
      await api.applyReferral(user.id, refCode.trim());
      await refresh();
      setReferralOpen(false);
      Alert.alert("Applied!", "₹50 will be credited to both wallets after your first completed ride.");
    } catch (e: any) {
      Alert.alert("Couldn't apply", e.message);
    }
  };

  const subscribePlus = async (provider: "razorpay" | "phonepe") => {
    setSubscribing(true);
    try {
      const order = await api.createPaymentOrder({
        provider,
        purpose: "subscription",
        user_id: user.id,
      });
      router.push({
        pathname: "/checkout",
        params: {
          payment_id: order.payment_id,
          checkout_url: order.checkout_url,
          provider: order.provider,
          simulated: String(order.simulated),
          return_path: "/(tabs)/profile",
        },
      });
    } catch (e: any) {
      Alert.alert("Failed", e.message);
    }
    setSubscribing(false);
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
          {badges.length > 0 && (
            <View style={styles.badgesRow} testID="badges-row">
              {badges.map((b) => (
                <View key={b.key} style={styles.badge} testID={`badge-${b.key}`}>
                  <Ionicons name={b.icon} size={12} color={colors.brandPrimary} />
                  <Text style={styles.badgeText}>{b.label}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Driver Plus */}
        <View style={styles.plusCard} testID="driver-plus-card">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="star" size={20} color="#FFD54F" />
            <Text style={styles.plusTitle}>Driver Plus</Text>
            {dpActive && <View style={styles.plusActive}><Text style={styles.plusActiveText}>ACTIVE</Text></View>}
          </View>
          {dpActive ? (
            <Text style={styles.plusSub}>
              {dp.rides_left} commission-free rides left · expires {new Date(dp.expires_at).toLocaleDateString()}
            </Text>
          ) : (
            <>
              <Text style={styles.plusSub}>0% commission on 20 rides · priority in search · ₹99/30 days</Text>
              <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
                <Pressable style={styles.plusBtn} onPress={() => subscribePlus("razorpay")} disabled={subscribing} testID="subscribe-razorpay">
                  <Text style={styles.plusBtnText}>{subscribing ? "…" : "Subscribe · Razorpay"}</Text>
                </Pressable>
                <Pressable style={[styles.plusBtn, styles.plusBtnGhost]} onPress={() => subscribePlus("phonepe")} disabled={subscribing} testID="subscribe-phonepe">
                  <Text style={[styles.plusBtnText, { color: colors.brandPrimary }]}>PhonePe</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>

        {/* Referral */}
        <View style={styles.refCard} testID="referral-card">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="gift" size={20} color={colors.brandPrimary} />
            <Text style={styles.refTitle}>Refer & Earn ₹50</Text>
          </View>
          <Text style={styles.refSub}>You both get ₹50 wallet credit when your friend completes their first ride.</Text>
          <View style={styles.refRow}>
            <View style={styles.codeBox} testID="referral-code">
              <Text style={styles.codeText}>{user.referral_code || "…"}</Text>
            </View>
            <Pressable style={styles.shareBtn} onPress={shareReferral} testID="share-referral-button">
              <Ionicons name="share-social" size={16} color="#fff" />
              <Text style={styles.shareText}>Share</Text>
            </Pressable>
          </View>
          {!(user as any).referred_by && (
            <Pressable onPress={() => setReferralOpen(true)} style={{ marginTop: spacing.sm }} testID="have-code-button">
              <Text style={{ color: colors.brandPrimary, fontWeight: "700", fontSize: 13 }}>Have a friend&apos;s code? Apply it →</Text>
            </Pressable>
          )}
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
          <Row icon="information-circle" label="About PAID LIFT" onPress={() => Alert.alert("PAID LIFT", "Peer-to-peer ride-sharing for India.\nVersion 1.3")} testID="row-about" />
          <Row icon="log-out" label="Sign out" onPress={handleSignOut} iconColor={colors.error} testID="row-signout" />
        </Section>
      </ScrollView>

      <Modal transparent visible={referralOpen} animationType="fade" onRequestClose={() => setReferralOpen(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Apply referral code</Text>
            <TextInput
              testID="referral-code-input"
              style={styles.modalInput}
              autoCapitalize="characters"
              placeholder="e.g. RAHU4F2A"
              placeholderTextColor={colors.onSurfaceTertiary}
              value={refCode}
              onChangeText={setRefCode}
            />
            <Pressable style={styles.modalBtn} onPress={applyCode} testID="apply-referral-button">
              <Text style={styles.modalBtnText}>Apply</Text>
            </Pressable>
            <Pressable onPress={() => setReferralOpen(false)} style={{ padding: spacing.md, alignItems: "center" }}>
              <Text style={{ color: colors.onSurfaceSecondary, fontWeight: "600" }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  avatar: { width: 82, height: 82, borderRadius: 41, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: 32, fontWeight: "800" },
  name: { ...type.h2, marginTop: spacing.md },
  phone: { ...type.bodySm, marginTop: 2 },
  verified: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#E8F5E9", paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill, marginTop: spacing.sm },
  verifiedText: { fontSize: 11, color: colors.success, fontWeight: "700" },
  rating: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.sm },
  ratingText: { fontSize: 12, color: colors.onSurfaceSecondary, fontWeight: "600" },
  badgesRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: spacing.md, justifyContent: "center" },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  badgeText: { fontSize: 11, color: colors.brandPrimary, fontWeight: "700" },
  plusCard: { marginTop: spacing.xl, backgroundColor: colors.onSurface, borderRadius: radius.lg, padding: spacing.lg },
  plusTitle: { color: "#fff", fontSize: 17, fontWeight: "800" },
  plusActive: { backgroundColor: colors.success, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  plusActiveText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  plusSub: { color: "rgba(255,255,255,0.75)", fontSize: 13, marginTop: 6 },
  plusBtn: { flex: 1, backgroundColor: colors.brandPrimary, borderRadius: radius.md, paddingVertical: 12, alignItems: "center" },
  plusBtnGhost: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: colors.brandPrimary },
  plusBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  refCard: { marginTop: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  refTitle: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  refSub: { fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 4 },
  refRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  codeBox: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, alignItems: "center", justifyContent: "center", paddingVertical: 12, borderWidth: 1, borderStyle: "dashed", borderColor: colors.brandPrimary },
  codeText: { fontSize: 18, fontWeight: "800", letterSpacing: 2, color: colors.brandPrimary },
  shareBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.brandPrimary, borderRadius: radius.md, paddingHorizontal: spacing.lg },
  shareText: { color: "#fff", fontWeight: "800" },
  sectionTitle: { ...type.label, marginBottom: spacing.sm },
  sectionCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 14, paddingHorizontal: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  rowLabel: { flex: 1, fontSize: 15, color: colors.onSurface, fontWeight: "600" },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: spacing.xl },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl },
  modalTitle: { ...type.h2, marginBottom: spacing.md },
  modalInput: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, fontSize: 16, fontWeight: "700", letterSpacing: 1, color: colors.onSurface },
  modalBtn: { backgroundColor: colors.brandPrimary, borderRadius: radius.md, paddingVertical: 14, alignItems: "center", marginTop: spacing.lg },
  modalBtnText: { color: "#fff", fontWeight: "800" },
});
