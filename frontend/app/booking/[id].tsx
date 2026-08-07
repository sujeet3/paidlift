import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, TextInput, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";

import { api } from "@/src/api";
import { useUser } from "@/src/context/user";
import { colors, spacing, radius, type } from "@/src/theme";

export default function BookingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, refresh } = useUser();
  const [b, setB] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState(false);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getBooking(id!);
      setB(data);
    } catch {}
    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading || !b) {
    return <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>;
  }

  const isOwner = user?.id === b.owner_id;
  const isPassenger = user?.id === b.passenger_id;

  const update = async (patch: any) => {
    setAction(true);
    try {
      await api.updateBooking(id!, patch);
      await load();
      await refresh();
    } catch (e: any) {
      Alert.alert("Failed", e.message);
    }
    setAction(false);
  };

  const pay = async () => {
    if (!user) return;
    if (user.wallet_balance < b.total_price) {
      Alert.alert("Insufficient balance", `Add ₹${(b.total_price - user.wallet_balance).toFixed(2)} to your wallet first.`, [
        { text: "Cancel" },
        { text: "Go to Wallet", onPress: () => router.push("/(tabs)/wallet") },
      ]);
      return;
    }
    await update({ paid: true });
    Alert.alert("Payment successful", `₹${b.total_price} paid to ${b.owner?.name}. (Mocked)`);
  };

  const submitRating = async () => {
    try {
      await api.rate({
        booking_id: b.id,
        rater_id: user!.id,
        rated_id: isPassenger ? b.owner_id : b.passenger_id,
        stars,
        comment,
      });
      setRatingOpen(false);
      Alert.alert("Thanks!", "Your rating has been recorded.");
    } catch (e: any) {
      Alert.alert("Failed", e.message);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></Pressable>
        <Text style={styles.title}>Booking</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120 }}>
        <View style={styles.statusCard}>
          <Text style={styles.statusLabel}>Status</Text>
          <Text style={styles.status}>{b.status.toUpperCase()}</Text>
          {b.paid && <Text style={styles.paid}>Paid ✓</Text>}
        </View>

        <View style={styles.card}>
          <Text style={styles.route}>{b.ride?.from_location} → {b.ride?.to_location}</Text>
          <Text style={styles.small}>{new Date(b.ride?.depart_at).toLocaleString()}</Text>
          <View style={styles.divider} />
          <Row label="Seats" value={String(b.seats)} />
          <Row label="Total" value={`₹${b.total_price}`} valueStyle={{ color: colors.brandPrimary, fontWeight: "800" }} />
          <Row label={isPassenger ? "Driver" : "Passenger"} value={isPassenger ? (b.owner?.name || "-") : (b.passenger?.name || "-")} />
        </View>

        {isOwner && b.status === "pending" && (
          <View style={styles.actionRow}>
            <Pressable style={[styles.actionBtn, { backgroundColor: colors.success }]} onPress={() => update({ status: "accepted" })} disabled={action} testID="accept-button">
              <Text style={styles.actionText}>Accept</Text>
            </Pressable>
            <Pressable style={[styles.actionBtn, { backgroundColor: colors.error }]} onPress={() => update({ status: "rejected" })} disabled={action} testID="reject-button">
              <Text style={styles.actionText}>Reject</Text>
            </Pressable>
          </View>
        )}

        {isPassenger && b.status === "accepted" && !b.paid && (
          <Pressable style={styles.primary} onPress={pay} disabled={action} testID="pay-button">
            <Ionicons name="card" size={18} color="#fff" />
            <Text style={styles.primaryText}>Pay ₹{b.total_price}</Text>
          </Pressable>
        )}

        {b.status === "accepted" && (
          <View style={styles.actionRow}>
            <Pressable style={[styles.linkBtn]} onPress={() => router.push({ pathname: "/chat/[bookingId]", params: { bookingId: b.id } })} testID="chat-button">
              <Ionicons name="chatbubbles" size={18} color={colors.brandPrimary} />
              <Text style={styles.linkText}>Chat</Text>
            </Pressable>
            <Pressable style={[styles.linkBtn]} onPress={() => router.push({ pathname: "/live-tracking/[bookingId]", params: { bookingId: b.id } })} testID="track-button">
              <Ionicons name="navigate" size={18} color={colors.brandPrimary} />
              <Text style={styles.linkText}>Track</Text>
            </Pressable>
          </View>
        )}

        {b.status === "accepted" && b.paid && (
          <Pressable style={[styles.linkBtn, { marginTop: spacing.md }]} onPress={() => update({ status: "completed" })} testID="complete-button">
            <Ionicons name="checkmark-done" size={18} color={colors.success} />
            <Text style={[styles.linkText, { color: colors.success }]}>Mark as Completed</Text>
          </Pressable>
        )}

        {b.status === "completed" && (
          <Pressable style={styles.primary} onPress={() => setRatingOpen(true)} testID="rate-button">
            <Ionicons name="star" size={18} color="#fff" />
            <Text style={styles.primaryText}>Rate {isPassenger ? "Driver" : "Passenger"}</Text>
          </Pressable>
        )}
      </ScrollView>

      <Modal transparent visible={ratingOpen} animationType="fade" onRequestClose={() => setRatingOpen(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Rate your experience</Text>
            <View style={{ flexDirection: "row", justifyContent: "center", marginVertical: spacing.lg }}>
              {[1, 2, 3, 4, 5].map((s) => (
                <Pressable key={s} onPress={() => setStars(s)} testID={`star-${s}`}>
                  <Ionicons name={s <= stars ? "star" : "star-outline"} size={36} color={colors.warning} />
                </Pressable>
              ))}
            </View>
            <TextInput
              placeholder="Add a comment (optional)"
              placeholderTextColor={colors.onSurfaceTertiary}
              style={styles.fieldInput}
              value={comment}
              onChangeText={setComment}
              multiline
            />
            <Pressable style={styles.primary} onPress={submitRating} testID="submit-rating">
              <Text style={styles.primaryText}>Submit</Text>
            </Pressable>
            <Pressable onPress={() => setRatingOpen(false)} style={{ padding: spacing.md, alignItems: "center" }}>
              <Text style={{ color: colors.onSurfaceSecondary, fontWeight: "600" }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Row({ label, value, valueStyle }: any) {
  return (
    <View style={styles.rowLine}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, valueStyle]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", padding: spacing.lg, gap: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider },
  backBtn: { padding: 4 },
  title: { ...type.h2 },
  statusCard: { backgroundColor: colors.onSurface, borderRadius: radius.lg, padding: spacing.xl },
  statusLabel: { color: "rgba(255,255,255,0.7)", fontSize: 12, textTransform: "uppercase", letterSpacing: 1 },
  status: { color: "#fff", fontSize: 26, fontWeight: "800", marginTop: 4, letterSpacing: 0.5 },
  paid: { color: colors.success, fontWeight: "800", marginTop: 6 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, marginTop: spacing.md },
  route: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  small: { fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.md },
  rowLine: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  rowLabel: { color: colors.onSurfaceSecondary, fontSize: 13 },
  rowValue: { color: colors.onSurface, fontSize: 14, fontWeight: "600" },
  actionRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  actionBtn: { flex: 1, paddingVertical: 14, borderRadius: radius.md, alignItems: "center" },
  actionText: { color: "#fff", fontWeight: "800" },
  primary: { flexDirection: "row", gap: 8, backgroundColor: colors.brandPrimary, paddingVertical: 15, borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginTop: spacing.lg },
  primaryText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  linkBtn: { flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, paddingVertical: 13, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.brandPrimary },
  linkText: { color: colors.brandPrimary, fontWeight: "700" },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: spacing.xl },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl },
  modalTitle: { ...type.h2 },
  fieldInput: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, fontSize: 15, minHeight: 60 },
});
