import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router, Stack } from "expo-router";

import { api } from "@/src/api";
import { colors, spacing, radius, type, VEHICLE_TYPES } from "@/src/theme";

export default function SearchResults() {
  const params = useLocalSearchParams<{ from?: string; to?: string; date?: string; vehicle_type?: string }>();
  const [rides, setRides] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const q: any = {};
        if (params.from) q.from_location = params.from;
        if (params.to) q.to_location = params.to;
        if (params.date) q.date = params.date;
        if (params.vehicle_type) q.vehicle_type = params.vehicle_type;
        const data = await api.searchRides(q);
        setRides(data);
      } catch {}
      setLoading(false);
    })();
  }, [params.from, params.to, params.date, params.vehicle_type]);

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} testID="back-button">
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.route}>
            {params.from || "Any"} → {params.to || "Any"}
          </Text>
          <Text style={styles.meta}>{params.date || "Any date"} · {rides.length} rides</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {loading && <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xxl }} />}

        {!loading && rides.length === 0 && (
          <View style={styles.empty} testID="empty-results">
            <Ionicons name="road-outline" size={48} color={colors.onSurfaceTertiary} />
            <Text style={styles.emptyText}>No rides found</Text>
            <Text style={styles.emptySub}>Try changing your date or vehicle filters.</Text>
          </View>
        )}

        {rides.map((r) => (
          <Pressable
            key={r.id}
            testID={`ride-card-${r.id}`}
            style={styles.card}
            onPress={() => router.push({ pathname: "/ride/[id]", params: { id: r.id } })}
          >
            <View style={styles.cardTop}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{(r.owner?.name || "U").slice(0, 1)}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={styles.owner}>{r.owner?.name || "Driver"}</Text>
                  {r.owner?.aadhaar_verified && (
                    <Ionicons name="shield-checkmark" size={14} color={colors.success} />
                  )}
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                    <Ionicons name="star" size={12} color={colors.warning} />
                    <Text style={styles.small}>{r.owner?.rating_avg?.toFixed(1) || "New"}</Text>
                  </View>
                  <Text style={styles.small}>·</Text>
                  <Text style={styles.small}>{vehicleLabel(r.vehicle_type)}</Text>
                </View>
              </View>
              <Text style={styles.price}>₹{r.price_per_seat}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.routeBlock}>
              <View style={styles.routeLine}>
                <View style={styles.dotFrom} />
                <Text style={styles.stopText}>{r.from_location}</Text>
              </View>
              {(r.stops || []).map((s: string, idx: number) => (
                <View key={idx} style={styles.routeLine}>
                  <View style={styles.dotMid} />
                  <Text style={styles.stopSmall}>{s}</Text>
                </View>
              ))}
              <View style={styles.routeLine}>
                <View style={styles.dotTo} />
                <Text style={styles.stopText}>{r.to_location}</Text>
              </View>
            </View>

            <View style={styles.footer}>
              <View style={styles.footerItem}>
                <Ionicons name="time" size={13} color={colors.onSurfaceSecondary} />
                <Text style={styles.footerText}>{new Date(r.depart_at).toLocaleString()}</Text>
              </View>
              <View style={styles.footerItem}>
                <Ionicons name="people" size={13} color={colors.onSurfaceSecondary} />
                <Text style={styles.footerText}>{r.seats_available} seats</Text>
              </View>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function vehicleLabel(k: string) {
  return VEHICLE_TYPES.find((v) => v.key === k)?.label || k;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  backBtn: { padding: 4 },
  route: { fontSize: 17, fontWeight: "800", color: colors.onSurface },
  meta: { fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 2 },
  list: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  empty: { alignItems: "center", marginTop: spacing.xxxl },
  emptyText: { ...type.h3, marginTop: spacing.md },
  emptySub: { ...type.bodySm, marginTop: 4 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTop: { flexDirection: "row", alignItems: "center" },
  avatar: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: colors.brandTertiary,
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { color: colors.brandPrimary, fontWeight: "800" },
  owner: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  small: { fontSize: 12, color: colors.onSurfaceSecondary },
  price: { fontSize: 20, fontWeight: "800", color: colors.brandPrimary },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.md },
  routeBlock: { gap: 6 },
  routeLine: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  dotFrom: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brandPrimary },
  dotMid: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.onSurfaceTertiary, marginLeft: 2 },
  dotTo: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.onSurface },
  stopText: { fontSize: 14, color: colors.onSurface, fontWeight: "600" },
  stopSmall: { fontSize: 12, color: colors.onSurfaceSecondary, marginLeft: 4 },
  footer: { flexDirection: "row", gap: spacing.lg, marginTop: spacing.md },
  footerItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  footerText: { fontSize: 12, color: colors.onSurfaceSecondary },
});
