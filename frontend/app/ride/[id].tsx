import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, router } from "expo-router";

import { api } from "@/src/api";
import { useUser } from "@/src/context/user";
import { colors, spacing, radius, type, VEHICLE_TYPES } from "@/src/theme";

const MAP = "https://images.unsplash.com/photo-1523666045320-73edd7d5c53f?w=800&auto=format&fit=crop";

export default function RideDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useUser();
  const [ride, setRide] = useState<any>(null);
  const [seats, setSeats] = useState(1);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.getRide(id!);
        setRide(r);
      } catch {}
      setLoading(false);
    })();
  }, [id]);

  const book = async () => {
    if (!user || !ride) return;
    if (user.id === ride.owner_id) {
      Alert.alert("Not allowed", "You cannot book your own ride.");
      return;
    }
    setBooking(true);
    try {
      const b = await api.createBooking({ ride_id: ride.id, passenger_id: user.id, seats });
      router.replace({ pathname: "/booking/[id]", params: { id: b.id } });
    } catch (e: any) {
      Alert.alert("Booking failed", e.message);
    }
    setBooking(false);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brandPrimary} size="large" />
      </View>
    );
  }

  if (!ride) {
    return (
      <View style={styles.center}>
        <Text>Ride not found</Text>
      </View>
    );
  }

  const total = ride.price_per_seat * seats;
  const vLabel = VEHICLE_TYPES.find((v) => v.key === ride.vehicle_type)?.label || ride.vehicle_type;

  return (
    <View style={styles.root}>
      <View style={styles.mapWrap}>
        <Image source={MAP} style={styles.map} contentFit="cover" />
        <LinearGradient colors={["rgba(0,0,0,0.35)", "transparent"]} style={styles.mapScrim} />
        <SafeAreaView edges={["top"]} style={styles.mapHeader}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="back-button">
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </Pressable>
        </SafeAreaView>
      </View>

      <View style={styles.sheet}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120 }}>
          <View style={styles.driverRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(ride.owner?.name || "U").slice(0, 1)}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={styles.driverName}>{ride.owner?.name}</Text>
                {ride.owner?.aadhaar_verified && (
                  <View style={styles.verifiedPill}>
                    <Ionicons name="shield-checkmark" size={11} color={colors.success} />
                    <Text style={styles.verifiedText}>Verified</Text>
                  </View>
                )}
              </View>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 2, alignItems: "center" }}>
                <Ionicons name="star" size={12} color={colors.warning} />
                <Text style={styles.small}>{ride.owner?.rating_avg?.toFixed(1) || "New"} ({ride.owner?.rating_count || 0})</Text>
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.label}>Vehicle</Text>
              <Text style={styles.value}>{ride.vehicle?.make} {ride.vehicle?.model} · {vLabel}</Text>
            </View>
            <View style={styles.rowBetween}>
              <Text style={styles.label}>Plate</Text>
              <Text style={styles.value}>{ride.vehicle?.plate}</Text>
            </View>
            <View style={styles.rowBetween}>
              <Text style={styles.label}>Insurance</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                <Text style={styles.value}>Active</Text>
              </View>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Route</Text>
          <View style={styles.card}>
            <RouteRow dot="from" label={ride.from_location} time={new Date(ride.depart_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} />
            {(ride.stops || []).map((s: string, i: number) => (
              <RouteRow key={i} dot="mid" label={s} />
            ))}
            <RouteRow dot="to" label={ride.to_location} />
          </View>

          <Text style={styles.sectionTitle}>Departure</Text>
          <View style={styles.card}>
            <Text style={styles.date}>{new Date(ride.depart_at).toLocaleString()}</Text>
            <Text style={styles.small}>{ride.seats_available} seats available</Text>
          </View>

          {!!ride.notes && (
            <>
              <Text style={styles.sectionTitle}>Notes</Text>
              <View style={styles.card}>
                <Text style={type.body}>{ride.notes}</Text>
              </View>
            </>
          )}

          <Text style={styles.sectionTitle}>Seats</Text>
          <View style={styles.stepper}>
            <Pressable
              onPress={() => setSeats(Math.max(1, seats - 1))}
              style={styles.stepBtn}
              testID="seats-decr"
            >
              <Ionicons name="remove" size={20} color={colors.onSurface} />
            </Pressable>
            <Text style={styles.stepVal}>{seats}</Text>
            <Pressable
              onPress={() => setSeats(Math.min(ride.seats_available, seats + 1))}
              style={styles.stepBtn}
              testID="seats-incr"
            >
              <Ionicons name="add" size={20} color={colors.onSurface} />
            </Pressable>
          </View>
        </ScrollView>

        <SafeAreaView edges={["bottom"]} style={styles.ctaBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.total}>₹{total}</Text>
          </View>
          <Pressable testID="book-button" style={styles.cta} onPress={book} disabled={booking}>
            {booking ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>Request Booking</Text>}
          </Pressable>
        </SafeAreaView>
      </View>
    </View>
  );
}

function RouteRow({ dot, label, time }: { dot: "from" | "mid" | "to"; label: string; time?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 6 }}>
      <View
        style={[
          styles.dotBase,
          dot === "from" && { backgroundColor: colors.brandPrimary },
          dot === "to" && { backgroundColor: colors.onSurface },
          dot === "mid" && { backgroundColor: colors.onSurfaceTertiary, width: 6, height: 6, marginLeft: 2 },
        ]}
      />
      <Text style={[styles.stopText, dot === "mid" && { color: colors.onSurfaceSecondary, fontWeight: "500" }]}>{label}</Text>
      {time && <Text style={[styles.small, { marginLeft: "auto" }]}>{time}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  mapWrap: { height: "35%" },
  map: { width: "100%", height: "100%" },
  mapScrim: { position: "absolute", top: 0, left: 0, right: 0, height: 100 },
  mapHeader: { position: "absolute", top: 0, left: 0, right: 0, padding: spacing.md },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center", justifyContent: "center",
  },
  sheet: {
    flex: 1,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    marginTop: -20,
  },
  driverRow: { flexDirection: "row", alignItems: "center" },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.brandPrimary, fontSize: 20, fontWeight: "800" },
  driverName: { fontSize: 17, fontWeight: "700", color: colors.onSurface },
  verifiedPill: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "#E8F5E9", paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.pill,
  },
  verifiedText: { fontSize: 10, color: colors.success, fontWeight: "800" },
  small: { fontSize: 12, color: colors.onSurfaceSecondary },
  sectionTitle: { ...type.label, marginTop: spacing.lg, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: 6,
  },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { fontSize: 13, color: colors.onSurfaceSecondary },
  value: { fontSize: 13, color: colors.onSurface, fontWeight: "600" },
  date: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  stopText: { fontSize: 14, color: colors.onSurface, fontWeight: "600", marginLeft: spacing.md },
  dotBase: { width: 10, height: 10, borderRadius: 5 },
  stepper: {
    flexDirection: "row", alignItems: "center", alignSelf: "flex-start",
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill,
  },
  stepBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  stepVal: { fontSize: 18, fontWeight: "800", paddingHorizontal: spacing.lg, color: colors.onSurface },
  ctaBar: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.xl, paddingTop: spacing.md,
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
  },
  totalLabel: { fontSize: 11, color: colors.onSurfaceSecondary, textTransform: "uppercase", fontWeight: "700" },
  total: { fontSize: 22, fontWeight: "800", color: colors.brandPrimary },
  cta: {
    backgroundColor: colors.brandPrimary,
    paddingVertical: 14, paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
  },
  ctaText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
