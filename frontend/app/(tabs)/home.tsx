import { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { useUser } from "@/src/context/user";
import { colors, spacing, radius, type, VEHICLE_TYPES } from "@/src/theme";
import PlaceField from "@/src/components/PlaceField";

const POPULAR_ROUTES = [
  ["Mumbai", "Pune"],
  ["Delhi", "Jaipur"],
  ["Bengaluru", "Mysuru"],
  ["Ahmedabad", "Vadodara"],
  ["Chennai", "Pondicherry"],
];

export default function Home() {
  const { user } = useUser();
  const [mode, setMode] = useState<"find" | "offer">("find");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [date, setDate] = useState(""); // YYYY-MM-DD
  const [seats, setSeats] = useState("1");
  const [vehicleType, setVehicleType] = useState("all");
  const [womenOnly, setWomenOnly] = useState(false);
  const [evOnly, setEvOnly] = useState(false);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const goSearch = () => {
    router.push({
      pathname: "/search-results",
      params: {
        from, to, date,
        vehicle_type: vehicleType,
        ...(womenOnly ? { women_only: "true" } : {}),
        ...(evOnly ? { fuel_type: "ev" } : {}),
      },
    });
  };

  const goOffer = () => {
    router.push("/offer-ride");
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.hi}>Namaste,</Text>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{user?.name || "Traveler"}</Text>
            {user?.aadhaar_verified && (
              <View style={styles.verifiedPill} testID="aadhaar-verified-badge">
                <Ionicons name="shield-checkmark" size={12} color={colors.success} />
                <Text style={styles.verifiedText}>Aadhaar verified</Text>
              </View>
            )}
          </View>
        </View>
        <Pressable
          testID="sos-fab"
          style={styles.sosBtn}
          onPress={() => router.push("/sos")}
        >
          <Ionicons name="warning" size={18} color="#fff" />
          <Text style={styles.sosText}>SOS</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl }} showsVerticalScrollIndicator={false}>
        {/* Segmented control */}
        <View style={styles.segment} testID="mode-segment">
          <Pressable
            testID="mode-find"
            onPress={() => setMode("find")}
            style={[styles.segmentBtn, mode === "find" && styles.segmentActive]}
          >
            <Ionicons name="search" size={16} color={mode === "find" ? colors.onBrandPrimary : colors.onSurfaceSecondary} />
            <Text style={[styles.segmentText, mode === "find" && styles.segmentTextActive]}>Find a Ride</Text>
          </Pressable>
          <Pressable
            testID="mode-offer"
            onPress={() => setMode("offer")}
            style={[styles.segmentBtn, mode === "offer" && styles.segmentActive]}
          >
            <Ionicons name="car-sport" size={16} color={mode === "offer" ? colors.onBrandPrimary : colors.onSurfaceSecondary} />
            <Text style={[styles.segmentText, mode === "offer" && styles.segmentTextActive]}>Offer a Ride</Text>
          </Pressable>
        </View>

        {mode === "find" ? (
          <View style={styles.card}>
            <PlaceField
              testID="from-input"
              value={from}
              onChangeText={setFrom}
              placeholder="Leaving from"
              dotColor={colors.brandPrimary}
            />
            <View style={styles.divider} />
            <PlaceField
              testID="to-input"
              value={to}
              onChangeText={setTo}
              placeholder="Going to"
              dotColor={colors.onSurface}
            />
            <View style={styles.divider} />
            <View style={styles.fieldRow}>
              <Ionicons name="calendar" size={18} color={colors.onSurfaceSecondary} />
              <TextInput
                testID="date-input"
                placeholder="Date (YYYY-MM-DD)"
                placeholderTextColor={colors.onSurfaceTertiary}
                value={date}
                onChangeText={setDate}
                style={[styles.field, { marginLeft: spacing.md }]}
              />
            </View>
            <View style={styles.divider} />
            <View style={styles.fieldRow}>
              <Ionicons name="people" size={18} color={colors.onSurfaceSecondary} />
              <TextInput
                testID="seats-input"
                placeholder="Seats"
                placeholderTextColor={colors.onSurfaceTertiary}
                keyboardType="number-pad"
                value={seats}
                onChangeText={setSeats}
                style={[styles.field, { marginLeft: spacing.md }]}
              />
            </View>

            <Text style={styles.sectionLabel}>Vehicle type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              <Chip label="All" active={vehicleType === "all"} onPress={() => setVehicleType("all")} icon="apps" />
              {VEHICLE_TYPES.map((v) => (
                <Chip
                  key={v.key}
                  label={v.label}
                  icon={v.icon}
                  active={vehicleType === v.key}
                  onPress={() => setVehicleType(v.key)}
                />
              ))}
            </ScrollView>

            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
              <Pressable
                testID="filter-women-only"
                onPress={() => setWomenOnly(!womenOnly)}
                style={[styles.chip, womenOnly && { backgroundColor: "#AD1457", borderColor: "#AD1457" }]}
              >
                <Ionicons name="female" size={14} color={womenOnly ? "#fff" : colors.onSurfaceSecondary} />
                <Text style={[styles.chipText, womenOnly && { color: "#fff" }]}>Women-only</Text>
              </Pressable>
              <Pressable
                testID="filter-ev"
                onPress={() => setEvOnly(!evOnly)}
                style={[styles.chip, evOnly && { backgroundColor: colors.success, borderColor: colors.success }]}
              >
                <Ionicons name="leaf" size={14} color={evOnly ? "#fff" : colors.onSurfaceSecondary} />
                <Text style={[styles.chipText, evOnly && { color: "#fff" }]}>EV rides</Text>
              </Pressable>
            </View>

            <Pressable testID="search-button" style={styles.cta} onPress={goSearch}>
              <Ionicons name="search" size={18} color="#fff" />
              <Text style={styles.ctaText}>Search Rides</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.h2}>Earn on your route</Text>
            <Text style={styles.pMuted}>List empty seats on any highway or intercity route. You set the price, we handle discovery.</Text>
            <View style={styles.perksRow}>
              <Perk icon="cash-outline" text="Set your fare" />
              <Perk icon="shield-checkmark" text="Verified riders" />
              <Perk icon="chatbubble-ellipses" text="In-app chat" />
            </View>
            <Pressable testID="offer-ride-button" style={styles.cta} onPress={goOffer}>
              <Ionicons name="add-circle" size={18} color="#fff" />
              <Text style={styles.ctaText}>Post a Ride</Text>
            </Pressable>
            <Pressable testID="manage-vehicles-button" style={styles.ctaGhost} onPress={() => router.push("/vehicles")}>
              <Ionicons name="car" size={18} color={colors.brandPrimary} />
              <Text style={styles.ctaGhostText}>Manage Vehicles</Text>
            </Pressable>
          </View>
        )}

        <Text style={[styles.sectionLabel, { marginLeft: spacing.xl }]}>Popular routes</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.routeRow}>
          {POPULAR_ROUTES.map(([a, b]) => (
            <Pressable
              key={`${a}-${b}`}
              testID={`route-${a}-${b}`}
              onPress={() => {
                setFrom(a);
                setTo(b);
                setDate("");
                setMode("find");
              }}
              style={styles.routeChip}
            >
              <Ionicons name="location" size={14} color={colors.brandPrimary} />
              <Text style={styles.routeChipText}>{a} → {b}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </ScrollView>
    </SafeAreaView>
  );
}

function Chip({ label, active, onPress, icon }: any) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}
    >
      <Ionicons name={icon} size={14} color={active ? colors.onBrandPrimary : colors.onSurfaceSecondary} />
      <Text style={[styles.chipText, active && { color: colors.onBrandPrimary }]}>{label}</Text>
    </Pressable>
  );
}

function Perk({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={styles.perk}>
      <Ionicons name={icon} size={16} color={colors.brandPrimary} />
      <Text style={styles.perkText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  header: {
    flexDirection: "row",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  hi: { fontSize: 13, color: colors.onSurfaceSecondary },
  nameRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 2, flexWrap: "wrap" },
  name: { ...type.h2 },
  verifiedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#E8F5E9",
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  verifiedText: { fontSize: 11, color: colors.success, fontWeight: "700" },
  sosBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.error,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  sosText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  segment: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    padding: 4,
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: radius.pill,
  },
  segmentActive: { backgroundColor: colors.brandPrimary },
  segmentText: { fontWeight: "700", color: colors.onSurfaceSecondary, fontSize: 13 },
  segmentTextActive: { color: colors.onBrandPrimary },
  card: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fieldRow: { flexDirection: "row", alignItems: "center", paddingVertical: 4 },
  field: { flex: 1, fontSize: 15, color: colors.onSurface, paddingVertical: 12 },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: 2 },
  dotFrom: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brandPrimary, marginRight: spacing.md },
  dotTo: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.onSurface, marginRight: spacing.md },
  sectionLabel: { ...type.label, marginTop: spacing.lg, marginBottom: spacing.sm },
  chipRow: { gap: spacing.sm, paddingRight: spacing.lg },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexShrink: 0,
  },
  chipText: { fontSize: 13, color: colors.onSurfaceSecondary, fontWeight: "600" },
  cta: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.md,
    paddingVertical: 15,
    marginTop: spacing.lg,
  },
  ctaText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 15 },
  ctaGhost: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: colors.brandPrimary,
    borderRadius: radius.md,
    paddingVertical: 13,
    marginTop: spacing.md,
  },
  ctaGhostText: { color: colors.brandPrimary, fontWeight: "700", fontSize: 15 },
  h2: { ...type.h2 },
  pMuted: { ...type.bodySm, marginTop: 4 },
  perksRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  perk: {
    flex: 1,
    backgroundColor: colors.brandTertiary,
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: "center",
    gap: 4,
  },
  perkText: { fontSize: 11, color: colors.brandPrimary, fontWeight: "700", textAlign: "center" },
  routeRow: { gap: spacing.sm, paddingHorizontal: spacing.xl, paddingRight: spacing.xl },
  routeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    flexShrink: 0,
  },
  routeChipText: { fontSize: 13, color: colors.onSurface, fontWeight: "600" },
});
