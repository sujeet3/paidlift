import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";

import { api } from "@/src/api";
import { colors, spacing, radius, type, VEHICLE_TYPES } from "@/src/theme";

type Tab = "stats" | "revenue" | "users" | "vehicles" | "rides" | "withdrawals" | "sos";
const TABS: Tab[] = ["stats", "revenue", "vehicles", "withdrawals", "users", "rides", "sos"];

export default function Admin() {
  const [tab, setTab] = useState<Tab>("stats");
  const [stats, setStats] = useState<any>(null);
  const [revenue, setRevenue] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [rides, setRides] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [sos, setSos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === "stats") setStats(await api.adminStats());
      if (tab === "revenue") setRevenue(await api.adminRevenue());
      if (tab === "users") setUsers(await api.adminUsers());
      if (tab === "rides") setRides(await api.adminRides());
      if (tab === "vehicles") setVehicles(await api.adminVehicles());
      if (tab === "withdrawals") setWithdrawals(await api.listWithdrawals());
      if (tab === "sos") setSos(await api.adminSos());
    } catch {}
    setLoading(false);
  }, [tab]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const act = async (fn: () => Promise<any>, done: string) => {
    try {
      await fn();
      await load();
    } catch (e: any) {
      Alert.alert("Failed", e.message);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} testID="back-button"><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></Pressable>
        <Text style={styles.title}>Admin Panel</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
        {TABS.map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabActive]} testID={`admin-tab-${t}`}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t.toUpperCase()}</Text>
            {t === "vehicles" && stats?.pending_vehicles > 0 && <View style={styles.dot} />}
            {t === "withdrawals" && stats?.pending_withdrawals > 0 && <View style={styles.dot} />}
            {t === "sos" && stats?.open_sos > 0 && <View style={[styles.dot, { backgroundColor: colors.error }]} />}
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
            <StatCard label="Pending Vehicles" value={stats.pending_vehicles} icon="time" tint={colors.warning} />
            <StatCard label="Pending Payouts" value={stats.pending_withdrawals} icon="cash" tint={colors.warning} />
            <StatCard label="Open SOS" value={stats.open_sos} icon="warning" tint={colors.error} />
          </View>
        )}

        {tab === "revenue" && revenue && (
          <>
            <View style={styles.statsGrid}>
              <StatCard label="GMV" value={`₹${revenue.gmv.toLocaleString("en-IN")}`} icon="trending-up" />
              <StatCard label="Commission" value={`₹${revenue.commission.toLocaleString("en-IN")}`} icon="cut" tint={colors.brandPrimary} />
              <StatCard label="Top-ups" value={`₹${revenue.topups.toLocaleString("en-IN")}`} icon="wallet" />
              <StatCard label="Withdrawals" value={`₹${revenue.withdrawals.toLocaleString("en-IN")}`} icon="arrow-down" />
              <StatCard label="Paid Bookings" value={`${revenue.bookings_paid}/${revenue.bookings_total}`} icon="checkmark-done" />
              <StatCard label="Driver Plus" value={revenue.driver_plus_subscribers} icon="star" tint={colors.warning} />
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Take rate</Text>
              <Text style={styles.small}>
                {revenue.gmv > 0 ? `${((revenue.commission / revenue.gmv) * 100).toFixed(1)}% of GMV` : "No paid bookings yet"} ·
                10% standard, 0% for Driver Plus rides
              </Text>
            </View>
          </>
        )}

        {tab === "vehicles" && vehicles.map((v) => (
          <View key={v.id} style={styles.card} testID={`admin-vehicle-${v.id}`}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>{v.make} {v.model} · {v.plate}</Text>
              <Text style={[styles.pill, !v.approved && { backgroundColor: "#FFF3E0", color: colors.warning }]}>
                {v.approved ? "approved" : "pending"}
              </Text>
            </View>
            <Text style={styles.small}>{VEHICLE_TYPES.find((x) => x.key === v.vehicle_type)?.label} · {v.fuel_type} · {v.seats_total} seats · {v.owner?.name}</Text>
            <Text style={styles.small}>RC {v.rc_number || "—"} · INS {v.insurance_number || "—"} · DL {v.dl_number || "—"} · docs: {Object.keys(v.doc_photos || {}).length}</Text>
            {!v.approved && (
              <View style={styles.actionRow}>
                <Pressable style={[styles.miniBtn, { backgroundColor: colors.success }]} onPress={() => act(() => api.approveVehicle(v.id, true), "Approved")} testID={`approve-${v.id}`}>
                  <Text style={styles.miniBtnText}>Approve</Text>
                </Pressable>
                <Pressable style={[styles.miniBtn, { backgroundColor: colors.error }]} onPress={() => act(() => api.approveVehicle(v.id, false), "Rejected")} testID={`reject-${v.id}`}>
                  <Text style={styles.miniBtnText}>Reject</Text>
                </Pressable>
              </View>
            )}
          </View>
        ))}

        {tab === "withdrawals" && (
          withdrawals.length === 0 ? <Text style={styles.small}>No withdrawal requests.</Text> :
          withdrawals.map((w) => (
            <View key={w.id} style={styles.card} testID={`admin-withdrawal-${w.id}`}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>₹{w.amount} → {w.upi_id}</Text>
                <Text style={[styles.pill, w.status === "pending" && { backgroundColor: "#FFF3E0", color: colors.warning }, w.status === "rejected" && { backgroundColor: "#FFEBEE", color: colors.error }]}>
                  {w.status}
                </Text>
              </View>
              <Text style={styles.small}>{new Date(w.created_at).toLocaleString()}</Text>
              {w.status === "pending" && (
                <View style={styles.actionRow}>
                  <Pressable style={[styles.miniBtn, { backgroundColor: colors.success }]} onPress={() => act(() => api.decideWithdrawal(w.id, true), "Paid")} testID={`payout-${w.id}`}>
                    <Text style={styles.miniBtnText}>Mark Paid</Text>
                  </Pressable>
                  <Pressable style={[styles.miniBtn, { backgroundColor: colors.error }]} onPress={() => act(() => api.decideWithdrawal(w.id, false), "Rejected")} testID={`reject-w-${w.id}`}>
                    <Text style={styles.miniBtnText}>Reject + Refund</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ))
        )}

        {tab === "users" && users.map((u) => (
          <View key={u.id} style={styles.card} testID={`admin-user-${u.id}`}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>{u.name || "—"}</Text>
              <Text style={[styles.pill, u.suspended && { backgroundColor: "#FFEBEE", color: colors.error }]}>{u.suspended ? "suspended" : u.role}</Text>
            </View>
            <Text style={styles.small}>{u.phone} · {u.gender || "—"} · Aadhaar {u.aadhaar_verified ? `****${u.aadhaar_last4}` : "no"}</Text>
            <Text style={styles.small}>Wallet ₹{u.wallet_balance?.toFixed(2) || "0"} · ★{u.rating_avg || "—"} ({u.rating_count || 0}) · code {u.referral_code || "—"}</Text>
            <Pressable
              style={[styles.miniBtn, { backgroundColor: u.suspended ? colors.success : colors.error, marginTop: spacing.sm }]}
              onPress={() => act(() => api.suspendUser(u.id, !u.suspended), "Done")}
              testID={`suspend-${u.id}`}
            >
              <Text style={styles.miniBtnText}>{u.suspended ? "Unsuspend" : "Suspend"}</Text>
            </Pressable>
          </View>
        ))}

        {tab === "rides" && rides.map((r) => (
          <View key={r.id} style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>{r.from_location} → {r.to_location}</Text>
              <Text style={styles.pill}>{r.status}</Text>
            </View>
            <Text style={styles.small}>
              {VEHICLE_TYPES.find((v) => v.key === r.vehicle_type)?.label} · {r.seats_available} seats · ₹{r.price_per_seat}
              {r.women_only ? " · women-only" : ""}
            </Text>
            <Text style={styles.small}>{new Date(r.depart_at).toLocaleString()}</Text>
            {r.status === "open" && (
              <Pressable style={[styles.miniBtn, { backgroundColor: colors.error, marginTop: spacing.sm }]} onPress={() => act(() => api.delistRide(r.id), "Delisted")} testID={`delist-${r.id}`}>
                <Text style={styles.miniBtnText}>Delist ride</Text>
              </Pressable>
            )}
          </View>
        ))}

        {tab === "sos" && (
          sos.length === 0 ? <Text style={styles.small}>No SOS alerts.</Text> :
          sos.map((s) => (
            <View key={s.id} style={[styles.card, { borderColor: s.resolved ? colors.border : colors.error }]} testID={`admin-sos-${s.id}`}>
              <View style={styles.rowBetween}>
                <Text style={[styles.cardTitle, { color: s.resolved ? colors.onSurfaceSecondary : colors.error }]}>
                  {s.resolved ? "SOS (resolved)" : "🚨 SOS Alert"}
                </Text>
              </View>
              <Text style={styles.small}>User: {s.user_id}</Text>
              <Text style={styles.small}>Booking: {s.booking_id} · Location: {s.location || "—"}</Text>
              <Text style={styles.small}>{new Date(s.created_at).toLocaleString()}</Text>
              {!s.resolved && (
                <Pressable style={[styles.miniBtn, { backgroundColor: colors.success, marginTop: spacing.sm }]} onPress={() => act(() => api.resolveSos(s.id), "Resolved")} testID={`resolve-${s.id}`}>
                  <Text style={styles.miniBtnText}>Mark Resolved</Text>
                </Pressable>
              )}
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
  tab: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.lg, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexShrink: 0 },
  tabActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  tabText: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceSecondary, letterSpacing: 1 },
  tabTextActive: { color: "#fff" },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.warning },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  stat: { width: "47%", padding: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, gap: 4 },
  statValue: { fontSize: 24, fontWeight: "800", color: colors.onSurface },
  statLabel: { fontSize: 11, color: colors.onSurfaceSecondary, textTransform: "uppercase", letterSpacing: 1, fontWeight: "700" },
  card: { padding: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  cardTitle: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  pill: { backgroundColor: colors.brandTertiary, color: colors.brandPrimary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, fontSize: 11, fontWeight: "800" },
  small: { fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 2 },
  actionRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  miniBtn: { paddingHorizontal: spacing.lg, paddingVertical: 8, borderRadius: radius.md },
  miniBtnText: { color: "#fff", fontWeight: "800", fontSize: 12 },
});
