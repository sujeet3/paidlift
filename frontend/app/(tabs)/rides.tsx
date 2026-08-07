import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useFocusEffect } from "expo-router";

import { api } from "@/src/api";
import { useUser } from "@/src/context/user";
import { colors, spacing, radius, type } from "@/src/theme";

export default function Rides() {
  const { user } = useUser();
  const [tab, setTab] = useState<"passenger" | "owner">("passenger");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await api.listBookings(user.id, tab);
      setItems(data);
    } catch {}
    setLoading(false);
  }, [user, tab]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!user) return null;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>My Rides</Text>
      </View>

      <View style={styles.tabs} testID="rides-role-tabs">
        <Pressable
          testID="rides-tab-passenger"
          onPress={() => setTab("passenger")}
          style={[styles.tab, tab === "passenger" && styles.tabActive]}
        >
          <Text style={[styles.tabText, tab === "passenger" && styles.tabTextActive]}>As Passenger</Text>
        </Pressable>
        <Pressable
          testID="rides-tab-owner"
          onPress={() => setTab("owner")}
          style={[styles.tab, tab === "owner" && styles.tabActive]}
        >
          <Text style={[styles.tabText, tab === "owner" && styles.tabTextActive]}>As Driver</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brandPrimary} />}
      >
        {loading && items.length === 0 && (
          <ActivityIndicator style={{ marginTop: spacing.xxl }} color={colors.brandPrimary} />
        )}

        {!loading && items.length === 0 && (
          <View style={styles.empty} testID="rides-empty">
            <Ionicons name="car-outline" size={48} color={colors.onSurfaceTertiary} />
            <Text style={styles.emptyText}>No bookings yet</Text>
            <Text style={styles.emptySub}>
              {tab === "passenger" ? "Search for a ride to get started." : "Post a ride to receive bookings."}
            </Text>
          </View>
        )}

        {items.map((b) => (
          <Pressable
            key={b.id}
            testID={`booking-card-${b.id}`}
            style={styles.card}
            onPress={() => router.push({ pathname: "/booking/[id]", params: { id: b.id } })}
          >
            <View style={styles.cardTop}>
              <View style={styles.routeLine}>
                <Text style={styles.route}>
                  {b.ride?.from_location} <Ionicons name="arrow-forward" size={12} /> {b.ride?.to_location}
                </Text>
                <Text style={styles.date}>
                  {b.ride?.depart_at ? new Date(b.ride.depart_at).toLocaleString() : "—"}
                </Text>
              </View>
              <StatusPill status={b.status} />
            </View>
            <View style={styles.divider} />
            <View style={styles.metaRow}>
              <View style={styles.metaItem}>
                <Ionicons name="people" size={14} color={colors.onSurfaceSecondary} />
                <Text style={styles.metaText}>{b.seats} seat{b.seats > 1 ? "s" : ""}</Text>
              </View>
              <View style={styles.metaItem}>
                <Ionicons name="person" size={14} color={colors.onSurfaceSecondary} />
                <Text style={styles.metaText}>
                  {tab === "passenger" ? b.owner?.name : b.passenger?.name}
                </Text>
              </View>
              <Text style={styles.price}>₹{b.total_price}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: any = {
    pending: { bg: "#FFF3E0", fg: colors.warning, label: "Pending" },
    accepted: { bg: "#E8F5E9", fg: colors.success, label: "Accepted" },
    rejected: { bg: "#FFEBEE", fg: colors.error, label: "Rejected" },
    completed: { bg: colors.surfaceTertiary, fg: colors.onSurfaceSecondary, label: "Completed" },
    cancelled: { bg: "#FFEBEE", fg: colors.error, label: "Cancelled" },
  };
  const s = map[status] || map.pending;
  return (
    <View style={[styles.pill, { backgroundColor: s.bg }]}>
      <Text style={[styles.pillText, { color: s.fg }]}>{s.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  header: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, backgroundColor: colors.surface },
  title: { ...type.h1 },
  tabs: {
    flexDirection: "row",
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tab: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: radius.pill },
  tabActive: { backgroundColor: colors.brandPrimary },
  tabText: { fontSize: 13, fontWeight: "700", color: colors.onSurfaceSecondary },
  tabTextActive: { color: colors.onBrandPrimary },
  list: { padding: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.md },
  empty: { alignItems: "center", marginTop: spacing.xxxl, paddingHorizontal: spacing.xl },
  emptyText: { ...type.h3, marginTop: spacing.md },
  emptySub: { ...type.bodySm, textAlign: "center", marginTop: 4 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTop: { flexDirection: "row", alignItems: "flex-start" },
  routeLine: { flex: 1 },
  route: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  date: { fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.md },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 12, color: colors.onSurfaceSecondary },
  price: { marginLeft: "auto", fontWeight: "800", color: colors.brandPrimary, fontSize: 15 },
  pill: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  pillText: { fontSize: 11, fontWeight: "800" },
});
