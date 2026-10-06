import { useEffect, useState, useCallback, useRef } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, TextInput, Modal, Linking, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import * as Location from "expo-location";

import { api } from "@/src/api";
import { useUser } from "@/src/context/user";
import { colors, spacing, radius, type } from "@/src/theme";

export default function BookingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, refresh } = useUser();
  const [b, setB] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState(false);
  const [payChooserOpen, setPayChooserOpen] = useState(false);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");
  const [tripLive, setTripLive] = useState(false);
  const locSubRef = useRef<Location.LocationSubscription | null>(null);

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
    Alert.alert("Payment successful", `₹${b.total_price} paid to ${b.owner?.name}. (From wallet)`);
  };

  const payOnline = async (provider: "razorpay" | "phonepe") => {
    if (!user) return;
    setPayChooserOpen(false);
    try {
      const order = await api.createPaymentOrder({
        provider,
        purpose: "ride",
        user_id: user.id,
        booking_id: b.id,
      });
      router.push({
        pathname: "/checkout",
        params: {
          payment_id: order.payment_id,
          checkout_url: order.checkout_url,
          provider: order.provider,
          simulated: String(order.simulated),
          return_path: `/booking/${b.id}`,
        },
      });
    } catch (e: any) {
      Alert.alert("Failed", e.message);
    }
  };

  const startTrip = async () => {
    if (!user) return;
    // Location permission flow: check → request → settings fallback
    const perm = await Location.getForegroundPermissionsAsync();
    let granted = perm.granted;
    if (!granted && perm.canAskAgain) {
      const req = await Location.requestForegroundPermissionsAsync();
      granted = req.granted;
    }
    if (!granted) {
      Alert.alert(
        "Location needed",
        "Passengers track your live position during the trip. Enable location to start.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }
    if (Platform.OS === "web") {
      Alert.alert("Mobile only", "Live GPS broadcast works on the mobile app. Preview shows simulated tracking.");
      return;
    }
    try {
      locSubRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 10000, distanceInterval: 25 },
        async (pos) => {
          try {
            await api.postLocation({
              booking_id: id!,
              user_id: user.id,
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              heading: pos.coords.heading || 0,
            });
          } catch {}
        },
      );
      setTripLive(true);
      Alert.alert("Trip started", "Passengers can now see your live location.");
    } catch (e: any) {
      Alert.alert("Could not start tracking", e.message);
    }
  };

  const endTrip = async () => {
    try { locSubRef.current?.remove(); } catch {}
    locSubRef.current = null;
    setTripLive(false);
    await update({ status: "completed" });
  };

  const cancelBooking = () => {
    Alert.alert(
      "Cancel booking?",
      b.paid ? "A full refund will be credited to the passenger's wallet." : "This booking will be cancelled.",
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Cancel booking",
          style: "destructive",
          onPress: async () => {
            await update({ status: "cancelled" });
            Alert.alert("Cancelled", b.paid ? "Refund has been issued to the passenger wallet." : "Booking cancelled.");
          },
        },
      ],
    );
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
          <>
            <Pressable style={styles.primary} onPress={() => setPayChooserOpen(true)} disabled={action} testID="pay-online-button">
              <Ionicons name="card" size={18} color="#fff" />
              <Text style={styles.primaryText}>Pay ₹{b.total_price} Online</Text>
            </Pressable>
            <Pressable style={[styles.linkBtn, { marginTop: spacing.sm }]} onPress={pay} disabled={action} testID="pay-wallet-button">
              <Ionicons name="wallet" size={18} color={colors.brandPrimary} />
              <Text style={styles.linkText}>Pay from Wallet (₹{user?.wallet_balance?.toFixed(2) || "0"})</Text>
            </Pressable>
          </>
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

        {isOwner && b.status === "accepted" && b.paid && !tripLive && (
          <Pressable style={[styles.primary, { backgroundColor: colors.success }]} onPress={startTrip} testID="start-trip-button">
            <Ionicons name="navigate-circle" size={18} color="#fff" />
            <Text style={styles.primaryText}>Start Trip · Share Live GPS</Text>
          </Pressable>
        )}

        {isOwner && tripLive && (
          <Pressable style={[styles.primary, { backgroundColor: colors.onSurface }]} onPress={endTrip} testID="end-trip-button">
            <Ionicons name="flag" size={18} color="#fff" />
            <Text style={styles.primaryText}>End Trip (mark completed)</Text>
          </Pressable>
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

        {(b.status === "pending" || (b.status === "accepted" && !tripLive)) && (
          <Pressable style={styles.cancelBtn} onPress={cancelBooking} testID="cancel-booking-button">
            <Ionicons name="close-circle-outline" size={18} color={colors.error} />
            <Text style={styles.cancelText}>Cancel booking{b.paid ? " (full refund)" : ""}</Text>
          </Pressable>
        )}

        {b.status === "cancelled" && (
          <View style={styles.refundNote} testID="refund-note">
            <Ionicons name="information-circle" size={16} color={colors.info} />
            <Text style={styles.refundText}>{b.paid ? "Cancelled — full refund credited to passenger wallet." : "This booking was cancelled."}</Text>
          </View>
        )}
      </ScrollView>

      <Modal transparent visible={payChooserOpen} animationType="slide" onRequestClose={() => setPayChooserOpen(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Choose payment method</Text>
            <Text style={{ color: colors.onSurfaceSecondary, marginTop: 4 }}>You&apos;ll pay ₹{b.total_price} to {b.owner?.name}. 10% platform fee applies to the driver&apos;s earning (0% for Driver Plus).</Text>
            <Pressable testID="pay-razorpay" style={styles.gwBig} onPress={() => payOnline("razorpay")}>
              <Ionicons name="card" size={22} color={colors.brandPrimary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.gwBigTitle}>Razorpay</Text>
                <Text style={styles.gwBigSub}>UPI · Cards · Netbanking · Wallets</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
            </Pressable>
            <Pressable testID="pay-phonepe" style={styles.gwBig} onPress={() => payOnline("phonepe")}>
              <Ionicons name="phone-portrait" size={22} color={colors.brandPrimary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.gwBigTitle}>PhonePe</Text>
                <Text style={styles.gwBigSub}>UPI-first · India&apos;s #1 UPI app</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
            </Pressable>
            <Pressable onPress={() => setPayChooserOpen(false)} style={{ padding: spacing.md, alignItems: "center", marginTop: spacing.sm }}>
              <Text style={{ color: colors.onSurfaceSecondary, fontWeight: "600" }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

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
  gwBig: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, marginTop: spacing.md, backgroundColor: colors.surface },
  gwBigTitle: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  gwBigSub: { fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 2 },
  cancelBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 13, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.error, marginTop: spacing.lg },
  cancelText: { color: colors.error, fontWeight: "700" },
  refundNote: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#E3F2FD", padding: spacing.md, borderRadius: radius.md, marginTop: spacing.lg },
  refundText: { flex: 1, fontSize: 13, color: colors.info, fontWeight: "600" },
});
