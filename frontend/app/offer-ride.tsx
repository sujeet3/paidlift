import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { api } from "@/src/api";
import { useUser } from "@/src/context/user";
import { colors, spacing, radius, type, VEHICLE_TYPES } from "@/src/theme";

export default function OfferRide() {
  const { user } = useUser();
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [vehicleId, setVehicleId] = useState<string>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [stops, setStops] = useState("");
  const [date, setDate] = useState(""); // YYYY-MM-DD
  const [time, setTime] = useState("08:00");
  const [seats, setSeats] = useState("2");
  const [price, setPrice] = useState("300");
  const [notes, setNotes] = useState("");
  const [womenOnly, setWomenOnly] = useState(false);

  const HIGHWAY_HUBS = [
    "Kalamboli McDonalds",
    "Wakad Flyover",
    "IFFCO Chowk",
    "Kengeri Bus Stand",
    "Behror Mid-way",
  ];

  useEffect(() => {
    (async () => {
      if (!user) return;
      try {
        const v = await api.listVehicles(user.id);
        setVehicles(v);
        if (v[0]) setVehicleId(v[0].id);
      } catch {}
      setLoading(false);
    })();
  }, [user]);

  const addStop = (hub: string) => {
    if (!stops.includes(hub)) {
      setStops((prev) => (prev ? `${prev}, ${hub}` : hub));
    }
  };

  const publish = async () => {
    if (!user) return;
    if (!vehicleId) {
      Alert.alert("Add a vehicle first", "You need at least one vehicle to publish a ride.");
      router.push("/vehicles");
      return;
    }
    if (!from.trim() || !to.trim() || !date.trim()) {
      Alert.alert("Missing info", "Please fill from, to and date.");
      return;
    }
    if (womenOnly && user.gender?.toLowerCase() !== "female") {
      Alert.alert("Women-Only Policy", "Only verified female drivers can publish Women-Only rides.");
      return;
    }
    const vehicle = vehicles.find((v) => v.id === vehicleId);
    setSaving(true);
    try {
      const depart_at = `${date}T${time}:00Z`;
      await api.createRide({
        owner_id: user.id,
        vehicle_id: vehicleId,
        from_location: from,
        to_location: to,
        stops: stops.split(",").map((s) => s.trim()).filter(Boolean),
        depart_at,
        seats_available: parseInt(seats, 10) || 1,
        price_per_seat: parseFloat(price) || 0,
        vehicle_type: vehicle.vehicle_type,
        notes,
        women_only: womenOnly,
      });
      Alert.alert("Published!", "Your ride is now live for passengers to book.", [
        { text: "OK", onPress: () => router.replace("/(tabs)/rides") },
      ]);
    } catch (e: any) {
      Alert.alert("Failed", e.message);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.surfaceSecondary }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 25}
    >
      <SafeAreaView style={styles.root} edges={["top"]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></Pressable>
          <Text style={styles.title}>Offer a Ride</Text>
        </View>

        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionTitle}>Vehicle</Text>
          {vehicles.length === 0 ? (
            <Pressable style={styles.card} onPress={() => router.push("/vehicles")} testID="add-vehicle-cta">
              <Text style={styles.link}>+ Add a vehicle first</Text>
            </Pressable>
          ) : (
            <View style={{ gap: spacing.sm }}>
              {vehicles.map((v) => {
                const active = v.id === vehicleId;
                return (
                  <Pressable
                    key={v.id}
                    testID={`select-vehicle-${v.id}`}
                    style={[styles.vehicleCard, active && { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary }]}
                    onPress={() => setVehicleId(v.id)}
                  >
                    <View style={styles.vehicleIcon}>
                      <Ionicons name={VEHICLE_TYPES.find((x) => x.key === v.vehicle_type)?.icon || "car"} size={20} color={colors.brandPrimary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.vehicleTitle}>{v.make} {v.model} · {v.plate}</Text>
                      <Text style={styles.small}>{VEHICLE_TYPES.find((x) => x.key === v.vehicle_type)?.label} · {v.seats_total} seats</Text>
                    </View>
                    <Ionicons name={active ? "radio-button-on" : "radio-button-off"} size={20} color={active ? colors.brandPrimary : colors.onSurfaceTertiary} />
                  </Pressable>
                );
              })}
            </View>
          )}

          <Text style={styles.sectionTitle}>Route</Text>
          <View style={styles.card}>
            <TextInput testID="offer-from" style={styles.input} placeholder="From (city / highway)" placeholderTextColor={colors.onSurfaceTertiary} value={from} onChangeText={setFrom} />
            <View style={styles.divider} />
            <TextInput testID="offer-to" style={styles.input} placeholder="To" placeholderTextColor={colors.onSurfaceTertiary} value={to} onChangeText={setTo} />
            <View style={styles.divider} />
            <TextInput testID="offer-stops" style={styles.input} placeholder="Intermediate stops (comma-separated)" placeholderTextColor={colors.onSurfaceTertiary} value={stops} onChangeText={setStops} />
          </View>

          <View style={{ marginTop: spacing.sm }}>
            <Text style={[styles.small, { marginBottom: 6 }]}>Popular highway pickup hubs:</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {HIGHWAY_HUBS.map((hub) => {
                const added = stops.includes(hub);
                return (
                  <Pressable
                    key={hub}
                    onPress={() => addStop(hub)}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: radius.pill,
                      backgroundColor: added ? colors.brandPrimary : colors.surface,
                      borderWidth: 1,
                      borderColor: added ? colors.brandPrimary : colors.border,
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: "600", color: added ? "#fff" : colors.onSurfaceSecondary }}>
                      {added ? "✓ " : "+ "}{hub}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Text style={styles.sectionTitle}>When</Text>
          <View style={styles.card}>
            <TextInput testID="offer-date" style={styles.input} placeholder="Date (YYYY-MM-DD)" placeholderTextColor={colors.onSurfaceTertiary} value={date} onChangeText={setDate} />
            <View style={styles.divider} />
            <TextInput testID="offer-time" style={styles.input} placeholder="Time (HH:MM 24h)" placeholderTextColor={colors.onSurfaceTertiary} value={time} onChangeText={setTime} />
          </View>

          <Text style={styles.sectionTitle}>Seats & Price</Text>
          <View style={styles.rowCards}>
            <View style={[styles.card, { flex: 1 }]}>
              <Text style={styles.small}>Available seats</Text>
              <TextInput testID="offer-seats" style={styles.bigInput} keyboardType="number-pad" value={seats} onChangeText={setSeats} />
            </View>
            <View style={[styles.card, { flex: 1 }]}>
              <Text style={styles.small}>Price per seat (₹)</Text>
              <TextInput testID="offer-price" style={styles.bigInput} keyboardType="number-pad" value={price} onChangeText={setPrice} />
            </View>
          </View>

          <Text style={styles.sectionTitle}>Safety Preferences</Text>
          <Pressable
            style={[styles.card, { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg }]}
            onPress={() => setWomenOnly(!womenOnly)}
          >
            <View style={{ flex: 1, marginRight: spacing.md }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="woman" size={18} color="#D81B60" />
                <Text style={{ fontSize: 15, fontWeight: "700", color: colors.onSurface }}>Women-Only Ride</Text>
              </View>
              <Text style={styles.small}>Restricts booking exclusively to verified female passengers.</Text>
            </View>
            <Ionicons name={womenOnly ? "checkbox" : "square-outline"} size={24} color={womenOnly ? "#D81B60" : colors.onSurfaceTertiary} />
          </Pressable>

          <Text style={styles.sectionTitle}>Notes (optional)</Text>
          <View style={styles.card}>
            <TextInput testID="offer-notes" style={[styles.input, { minHeight: 60 }]} multiline placeholder="e.g. AC, non-smoking, pet-friendly" placeholderTextColor={colors.onSurfaceTertiary} value={notes} onChangeText={setNotes} />
          </View>
        </ScrollView>

        <SafeAreaView edges={["bottom"]} style={styles.ctaBar}>
          <Pressable testID="publish-ride-button" style={styles.cta} onPress={publish} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>Publish Ride</Text>}
          </Pressable>
        </SafeAreaView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", padding: spacing.lg, gap: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider },
  backBtn: { padding: 4 },
  title: { ...type.h2 },
  sectionTitle: { ...type.label, marginTop: spacing.lg, marginBottom: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  rowCards: { flexDirection: "row", gap: spacing.md },
  input: { fontSize: 15, color: colors.onSurface, paddingVertical: 10 },
  bigInput: { fontSize: 24, fontWeight: "800", color: colors.onSurface, paddingVertical: 6 },
  divider: { height: 1, backgroundColor: colors.divider },
  small: { fontSize: 12, color: colors.onSurfaceSecondary },
  vehicleCard: { flexDirection: "row", alignItems: "center", padding: spacing.md, gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border },
  vehicleIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  vehicleTitle: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  link: { color: colors.brandPrimary, fontWeight: "700", padding: spacing.sm },
  ctaBar: { padding: spacing.xl, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  cta: { backgroundColor: colors.brandPrimary, borderRadius: radius.md, paddingVertical: 15, alignItems: "center" },
  ctaText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
