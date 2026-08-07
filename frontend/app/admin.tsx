import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";

import { api } from "@/src/api";
import { colors, spacing, radius, type, VEHICLE_TYPES } from "@/src/theme";

export default function Admin() {
  const [tab, setTab] = useState<"stats" | "users" | "rides" | "sos">("stats");
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [rides, setRides] = useState<any[]>([]);
  const [sos, setSos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === "stats") setStats(await api.adminStats());
      if (tab === "users") setUsers(await api.adminUsers());
      if (tab === "rides") setRides(await api.adminRides());
      if (tab === "sos") setSos(await api.adminSos());
    } catch {}
    setLoading(false);
  }, [tab]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></Pressable>
        <Text style={styles.title}>Admin Panel</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
        {(["stats", "users", "rides", "sos"] as const).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabActive]} testID={`admin-tab-${t}`}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t.toUpperCase()}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brandPrimary} />}
      >
        {tab === "stats" && stats && (
          <View style={styles.statsGrid}>
            <StatCard label="Users" value={stats.users} icon="people" />
            <StatCard label="Vehicles" value={stats.vehicles} icon="car" />
            <StatCard label="Rides" value={stats.rides} icon="git-branch" />
            <StatCard label="Bookings" value={stats.bookings} icon="reader" />
            <StatCard label="SOS Alerts" value={stats.sos_alerts} icon="warning" tint={colors.error} />
          </View>
        )}

        {tab === "users" && users.map((u) => (
          <View key={u.id} style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>{u.name || "—"}</Text>
              <Text style={styles.pill}>{u.role}</Text>
            </View>
            <Text style={styles.small}>{u.phone} · {u.email || "no email"}</Text>
            <Text style={styles.small}>Aadhaar: {u.aadhaar_verified ? `verified (****${u.aadhaar_last4})` : "not verified"}</Text>
            <Text style={styles.small}>Wallet: ₹{u.wallet_balance?.toFixed(2) || "0.00"} · Rating {u.rating_avg || "—"}</Text>
          </View>
        ))}

        {tab === "rides" && rides.map((r) => (
          <View key={r.id} style={styles.card}>
            <Text style={styles.cardTitle}>{r.from_location} → {r.to_location}</Text>
            <Text style={styles.small}>{VEHICLE_TYPES.find((v) => v.key === r.vehicle_type)?.label} · {r.seats_available} seats · ₹{r.price_per_seat}</Text>
            <Text style={styles.small}>{new Date(r.depart_at).toLocaleString()} · {r.status}</Text>
          </View>
        ))}

        {tab === "sos" && (
          sos.length === 0 ? <Text style={styles.small}>No SOS alerts.</Text> :
          sos.map((s) => (
            <View key={s.id} style={[styles.card, { borderColor: colors.error }]}>
              <Text style={[styles.cardTitle, { color: colors.error }]}>SOS Alert</Text>
              <Text style={styles.small}>User: {s.user_id}</Text>
              <Text style={styles.small}>Booking: {s.booking_id}</Text>
              <Text style={styles.small}>{new Date(s.created_at).toLocaleString()}</Text>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ label, value, icon, tint }: any) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={22} color={tint || colors.brandPrimary} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  header: { flexDirection: "row", alignItems: "center", padding: spacing.lg, gap: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider },
  backBtn: { padding: 4 },
  title: { ...type.h2 },
  tabsRow: { gap: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  tab: { paddingHorizontal: spacing.lg, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexShrink: 0 },
  tabActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  tabText: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceSecondary, letterSpacing: 1 },
  tabTextActive: { color: "#fff" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  stat: { width: "47%", padding: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, gap: 4 },
  statValue: { fontSize: 28, fontWeight: "800", color: colors.onSurface },
  statLabel: { fontSize: 11, color: colors.onSurfaceSecondary, textTransform: "uppercase", letterSpacing: 1, fontWeight: "700" },
  card: { padding: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  cardTitle: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  pill: { backgroundColor: colors.brandTertiary, color: colors.brandPrimary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, fontSize: 11, fontWeight: "800" },
  small: { fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 2 },
});
