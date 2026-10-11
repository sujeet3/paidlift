import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";

import { api } from "@/src/api";
import { colors, spacing, radius, type, VEHICLE_TYPES } from "@/src/theme";

type AdminTab = "stats" | "vehicles" | "users" | "rides" | "payouts" | "sos" | "maintenance";

export default function Admin() {
  const [tab, setTab] = useState<AdminTab>("stats");
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [rides, setRides] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [sos, setSos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Filters
  const [userSearch, setUserSearch] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState<"all" | "pending" | "approved">("pending");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === "stats") {
        const res = await api.adminStats();
        setStats(res);
      }
      if (tab === "vehicles") {
        const res = await api.adminVehicles(vehicleFilter);
        setVehicles(res.vehicles || []);
      }
      if (tab === "users") {
        const res = await api.adminUsers(userSearch);
        setUsers(res.users || []);
      }
      if (tab === "rides") {
        const res = await api.adminRides();
        setRides(res.rides || []);
      }
      if (tab === "payouts") {
        const res = await api.adminPayouts();
        setPayouts(res || []);
      }
      if (tab === "sos") {
        const res = await api.adminSos();
        setSos(res || []);
      }
    } catch (e: any) {
      console.warn("Admin fetch error:", e?.message || e);
    }
    setLoading(false);
  }, [tab, vehicleFilter, userSearch]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // ---------- Action Handlers ----------
  const handleProcessPayout = async (payoutId: string, action: "approve" | "reject") => {
    setActionLoading(payoutId);
    try {
      await api.adminProcessPayout(payoutId, action);
      Alert.alert("Success", `Payout request ${action === "approve" ? "settled via IMPS/UPI" : "rejected & refunded to driver wallet"}.`);
      load();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to process payout");
    }
    setActionLoading(null);
  };

  const handleReviewVehicle = async (vehicleId: string, approved: boolean) => {
    setActionLoading(vehicleId);
    try {
      await api.adminReviewVehicle(vehicleId, approved, approved ? undefined : "Documents unverified or incomplete");
      Alert.alert("Success", approved ? "Vehicle approved successfully!" : "Vehicle rejected.");
      load();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to review vehicle");
    }
    setActionLoading(null);
  };

  const handleToggleUserBan = async (user: any) => {
    const isBanned = user.status === "banned";
    const newStatus = isBanned ? "active" : "banned";
    setActionLoading(user.id);
    try {
      await api.adminUpdateUser(user.id, { status: newStatus });
      Alert.alert("Success", `User has been ${isBanned ? "unbanned" : "banned"}.`);
      load();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to update user");
    }
    setActionLoading(null);
  };

  const handleAddWalletBalance = async (userId: string) => {
    setActionLoading(userId);
    try {
      await api.adminWalletAdjust(userId, 500, "Admin promotional test credit");
      Alert.alert("Success", "Credited ₹500 to user wallet.");
      load();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to adjust wallet");
    }
    setActionLoading(null);
  };

  const handleForceCancelRide = (rideId: string) => {
    Alert.alert(
      "Force Cancel Ride",
      "This will cancel the ride and automatically refund all paid passengers to their wallets. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Force Cancel & Refund",
          style: "destructive",
          onPress: async () => {
            setActionLoading(rideId);
            try {
              const res = await api.adminForceCancelRide(rideId, "Admin safety / schedule cancellation");
              Alert.alert("Ride Cancelled", `Ride cancelled. Issued ${res.refunds_issued?.length || 0} passenger refund(s).`);
              load();
            } catch (e: any) {
              Alert.alert("Error", e.message || "Failed to cancel ride");
            }
            setActionLoading(null);
          },
        },
      ]
    );
  };

  const handleResolveSos = async (sosId: string) => {
    setActionLoading(sosId);
    try {
      await api.adminUpdateSos(sosId, "resolved", "Resolved by Admin emergency response team.");
      Alert.alert("Success", "SOS alert marked resolved.");
      load();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to resolve SOS");
    }
    setActionLoading(null);
  };

  const handleCleanupExpiredRides = async () => {
    setActionLoading("cleanup");
    try {
      const res = await api.adminCleanupExpiredRides();
      Alert.alert("Maintenance Complete", `Auto-expired ${res.expired_rides_count} past open ride(s).`);
      load();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to cleanup rides");
    }
    setActionLoading(null);
  };

  const handleFixSeats = async () => {
    setActionLoading("fix_seats");
    try {
      const res = await api.adminFixSeats();
      Alert.alert("Seats Reconciled", `Checked ${res.rides_checked} rides. Fixed seat counts for ${res.rides_reconciled} ride(s).`);
      load();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to reconcile seats");
    }
    setActionLoading(null);
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Super Admin Panel</Text>
          <Text style={styles.subtitle}>Full Authority Marketplace Control</Text>
        </View>
        <Pressable onPress={load} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={18} color={colors.brandPrimary} />
        </Pressable>
      </View>

      {/* Tabs */}
      <View style={{ backgroundColor: colors.surface }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
          {[
            { id: "stats", label: "OVERVIEW", icon: "pie-chart" },
            { id: "vehicles", label: "VEHICLES & KYC", icon: "car" },
            { id: "users", label: "USERS", icon: "people" },
            { id: "rides", label: "RIDES", icon: "git-branch" },
            { id: "payouts", label: "PAYOUTS", icon: "cash" },
            { id: "sos", label: "EMERGENCY SOS", icon: "warning" },
            { id: "maintenance", label: "MAINTENANCE", icon: "construct" },
          ].map((t) => (
            <Pressable
              key={t.id}
              onPress={() => setTab(t.id as AdminTab)}
              style={[styles.tab, tab === t.id && styles.tabActive]}
            >

              <Ionicons
                name={t.icon as any}
                size={14}
                color={tab === t.id ? "#fff" : colors.onSurfaceSecondary}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.tabText, tab === t.id && styles.tabTextActive]}>{t.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brandPrimary} />}
      >
        {/* ==================== 1. OVERVIEW & FINANCIAL STATS ==================== */}
        {tab === "stats" && stats && (
          <View style={{ gap: spacing.md }}>
            <Text style={styles.sectionHeader}>Marketplace Counters</Text>
            <View style={styles.statsGrid}>
              <StatCard label="Total Users" value={stats.counts?.users || 0} icon="people" />
              <StatCard label="Vehicles" value={stats.counts?.vehicles || 0} icon="car" />
              <StatCard
                label="KYC Pending"
                value={stats.counts?.pending_vehicles || 0}
                icon="document-text"
                tint={colors.warning}
              />
              <StatCard label="Active Rides" value={stats.counts?.active_rides || 0} icon="git-branch" />
              <StatCard label="Total Bookings" value={stats.counts?.bookings || 0} icon="reader" />
              <StatCard
                label="Distress SOS"
                value={stats.counts?.active_sos || 0}
                icon="warning"
                tint={colors.error}
              />
            </View>

            <Text style={[styles.sectionHeader, { marginTop: spacing.md }]}>Financial Ledger Summary</Text>
            <View style={styles.financeCard}>
              <View style={styles.financeRow}>
                <Text style={styles.financeLabel}>Gross Merchandise Value (GMV):</Text>
                <Text style={styles.financeValue}>₹{(stats.financials?.gmv || 0).toFixed(2)}</Text>
              </View>
              <View style={styles.financeRow}>
                <Text style={styles.financeLabel}>Platform Commission (10%):</Text>
                <Text style={[styles.financeValue, { color: colors.success }]}>
                  ₹{(stats.financials?.platform_revenue || 0).toFixed(2)}
                </Text>
              </View>
              <View style={styles.financeRow}>
                <Text style={styles.financeLabel}>Total Wallet Liability:</Text>
                <Text style={styles.financeValue}>₹{(stats.financials?.wallet_liability || 0).toFixed(2)}</Text>
              </View>
            </View>
          </View>
        )}

        {/* ==================== 2. VEHICLES & KYC MODERATION ==================== */}
        {tab === "vehicles" && (
          <View style={{ gap: spacing.md }}>
            {/* Filter bar */}
            <View style={styles.filterRow}>
              {(["pending", "approved", "all"] as const).map((f) => (
                <Pressable
                  key={f}
                  onPress={() => setVehicleFilter(f)}
                  style={[styles.filterChip, vehicleFilter === f && styles.filterChipActive]}
                >
                  <Text style={[styles.filterChipText, vehicleFilter === f && styles.filterChipTextActive]}>
                    {f.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>

            {vehicles.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="checkmark-circle" size={36} color={colors.success} />
                <Text style={styles.emptyText}>No vehicles in this queue.</Text>
              </View>
            ) : (
              vehicles.map((v) => (
                <View key={v.id} style={styles.card}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.cardTitle}>{v.plate} · {v.make} {v.model}</Text>
                    <Text
                      style={[
                        styles.statusBadge,
                        v.approved ? styles.badgeSuccess : styles.badgeWarning,
                      ]}
                    >
                      {v.approved ? "APPROVED" : "PENDING KYC"}
                    </Text>
                  </View>

                  <Text style={styles.small}>
                    Type: {v.vehicle_type} · Seats: {v.seats_total}
                  </Text>
                  <Text style={styles.small}>
                    RC: {v.rc_number || "None"} · DL: {v.dl_number || "None"} · Insurance: {v.insurance_number || "None"}
                  </Text>
                  {v.owner && (
                    <Text style={styles.small}>
                      Driver: {v.owner.name || "Unnamed"} ({v.owner.phone})
                    </Text>
                  )}
                  {v.rejection_reason ? (
                    <Text style={[styles.small, { color: colors.error }]}>Reason: {v.rejection_reason}</Text>
                  ) : null}

                  {/* Actions */}
                  <View style={styles.actionsRow}>
                    {!v.approved ? (
                      <Pressable
                        onPress={() => handleReviewVehicle(v.id, true)}
                        style={[styles.btnAction, { backgroundColor: colors.success }]}
                        disabled={actionLoading === v.id}
                      >
                        <Ionicons name="checkmark" size={16} color="#fff" />
                        <Text style={styles.btnActionText}>Approve Vehicle</Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        onPress={() => handleReviewVehicle(v.id, false)}
                        style={[styles.btnAction, { backgroundColor: colors.error }]}
                        disabled={actionLoading === v.id}
                      >
                        <Ionicons name="close" size={16} color="#fff" />
                        <Text style={styles.btnActionText}>Revoke Approval</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* ==================== 3. USERS MANAGEMENT ==================== */}
        {tab === "users" && (
          <View style={{ gap: spacing.md }}>
            <View style={styles.searchBar}>
              <Ionicons name="search" size={18} color={colors.onSurfaceTertiary} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search by name, phone or email..."
                value={userSearch}
                onChangeText={setUserSearch}
                onSubmitEditing={load}
              />
              {userSearch.length > 0 && (
                <Pressable onPress={() => { setUserSearch(""); load(); }}>
                  <Ionicons name="close-circle" size={18} color={colors.onSurfaceTertiary} />
                </Pressable>
              )}
            </View>

            {users.map((u) => (
              <View key={u.id} style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>{u.name || "Unnamed User"}</Text>
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    <Text style={styles.pill}>{u.role}</Text>
                    {u.status === "banned" && (
                      <Text style={[styles.statusBadge, styles.badgeDanger]}>BANNED</Text>
                    )}
                  </View>
                </View>

                <Text style={styles.small}>{u.phone} · {u.email || "No email"}</Text>
                <Text style={styles.small}>
                  Aadhaar: {u.aadhaar_verified ? `Verified (****${u.aadhaar_last4})` : "Unverified"}
                </Text>
                <Text style={styles.small}>
                  Wallet Balance: ₹{(u.wallet_balance || 0).toFixed(2)} · Rating: {u.rating_avg || 5.0}★
                </Text>

                <View style={styles.actionsRow}>
                  <Pressable
                    onPress={() => handleAddWalletBalance(u.id)}
                    style={[styles.btnAction, { backgroundColor: colors.brandPrimary }]}
                    disabled={actionLoading === u.id}
                  >
                    <Ionicons name="wallet-outline" size={15} color="#fff" />
                    <Text style={styles.btnActionText}>+₹500 Balance</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => handleToggleUserBan(u)}
                    style={[
                      styles.btnAction,
                      { backgroundColor: u.status === "banned" ? colors.success : colors.error },
                    ]}
                    disabled={actionLoading === u.id}
                  >
                    <Ionicons name={u.status === "banned" ? "checkmark-circle" : "ban"} size={15} color="#fff" />
                    <Text style={styles.btnActionText}>
                      {u.status === "banned" ? "Unban User" : "Ban User"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ==================== 4. RIDES MODERATION ==================== */}
        {tab === "rides" && (
          <View style={{ gap: spacing.md }}>
            {rides.length === 0 ? (
              <Text style={styles.small}>No rides found.</Text>
            ) : (
              rides.map((r) => (
                <View key={r.id} style={styles.card}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.cardTitle}>{r.from_location} → {r.to_location}</Text>
                    <Text
                      style={[
                        styles.statusBadge,
                        r.status === "open"
                          ? styles.badgeSuccess
                          : r.status === "cancelled"
                          ? styles.badgeDanger
                          : styles.badgeWarning,
                      ]}
                    >
                      {r.status.toUpperCase()}
                    </Text>
                  </View>

                  <Text style={styles.small}>
                    Price: ₹{r.price_per_seat}/seat · Available Seats: {r.seats_available}
                  </Text>
                  <Text style={styles.small}>
                    Departure: {new Date(r.depart_at).toLocaleString()}
                  </Text>
                  {r.owner && (
                    <Text style={styles.small}>
                      Driver: {r.owner.name} ({r.owner.phone})
                    </Text>
                  )}
                  {r.cancel_reason ? (
                    <Text style={[styles.small, { color: colors.error }]}>Cancel Reason: {r.cancel_reason}</Text>
                  ) : null}

                  {r.status === "open" && (
                    <View style={styles.actionsRow}>
                      <Pressable
                        onPress={() => handleForceCancelRide(r.id)}
                        style={[styles.btnAction, { backgroundColor: colors.error }]}
                        disabled={actionLoading === r.id}
                      >
                        <Ionicons name="trash" size={15} color="#fff" />
                        <Text style={styles.btnActionText}>Force Cancel & Refund</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {/* ==================== 5. SOS EMERGENCY DISTRESS ==================== */}
        {tab === "sos" && (
          <View style={{ gap: spacing.md }}>
            {sos.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="shield-checkmark" size={36} color={colors.success} />
                <Text style={styles.emptyText}>All clear. Zero active SOS distress alerts.</Text>
              </View>
            ) : (
              sos.map((s) => (
                <View
                  key={s.id}
                  style={[
                    styles.card,
                    { borderColor: s.status === "resolved" ? colors.border : colors.error, borderWidth: 2 },
                  ]}
                >
                  <View style={styles.rowBetween}>
                    <Text style={[styles.cardTitle, { color: colors.error }]}>
                      🚨 Emergency SOS Alert
                    </Text>
                    <Text
                      style={[
                        styles.statusBadge,
                        s.status === "resolved" ? styles.badgeSuccess : styles.badgeDanger,
                      ]}
                    >
                      {(s.status || "ACTIVE").toUpperCase()}
                    </Text>
                  </View>

                  <Text style={styles.small}>User ID: {s.user_id}</Text>
                  {s.user && (
                    <Text style={styles.small}>
                      Contact: {s.user.name || "User"} ({s.user.phone})
                    </Text>
                  )}
                  <Text style={styles.small}>Booking ID: {s.booking_id}</Text>
                  <Text style={styles.small}>Time: {new Date(s.created_at).toLocaleString()}</Text>
                  {s.location ? <Text style={styles.small}>Coordinates: {s.location}</Text> : null}
                  {s.resolution_notes ? (
                    <Text style={[styles.small, { color: colors.success }]}>
                      Notes: {s.resolution_notes}
                    </Text>
                  ) : null}

                  {s.status !== "resolved" && (
                    <View style={styles.actionsRow}>
                      <Pressable
                        onPress={() => handleResolveSos(s.id)}
                        style={[styles.btnAction, { backgroundColor: colors.success }]}
                        disabled={actionLoading === s.id}
                      >
                        <Ionicons name="shield-checkmark" size={15} color="#fff" />
                        <Text style={styles.btnActionText}>Mark Resolved</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              ))
            )}
          </View>
        )}
        {/* ==================== 5. DRIVER PAYOUTS & WITHDRAWALS ==================== */}
        {tab === "payouts" && (
          <View style={{ gap: spacing.md }}>
            <Text style={styles.sectionHeader}>Driver Withdrawal Requests</Text>
            {payouts.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="cash-outline" size={40} color={colors.onSurfaceTertiary} />
                <Text style={styles.emptyText}>No pending payouts</Text>
                <Text style={styles.small}>Driver payout requests will appear here for settlement.</Text>
              </View>
            ) : (
              payouts.map((p) => (
                <View key={p.id} style={styles.card}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.cardTitle}>₹{p.amount?.toFixed(2)}</Text>
                    <View
                      style={[
                        styles.badge,
                        {
                          backgroundColor:
                            p.status === "completed" || p.status === "settled"
                              ? "#E8F5E9"
                              : p.status === "rejected"
                              ? "#FFEBEE"
                              : "#FFF3E0",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          {
                            color:
                              p.status === "completed" || p.status === "settled"
                                ? colors.success
                                : p.status === "rejected"
                                ? colors.error
                                : "#E65100",
                          },
                        ]}
                      >
                        {p.status?.toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.cardSub}>Driver ID: {p.user_id}</Text>
                  <Text style={styles.cardSub}>Beneficiary: {p.beneficiary_name || "Driver"}</Text>
                  <Text style={styles.cardSub}>Method: {p.payout_method?.toUpperCase()}</Text>
                  {p.payout_method === "upi" ? (
                    <Text style={[styles.cardSub, { fontWeight: "700", color: colors.brandPrimary }]}>
                      UPI ID: {p.upi_id}
                    </Text>
                  ) : (
                    <Text style={styles.cardSub}>
                      A/C: {p.account_number} | IFSC: {p.ifsc}
                    </Text>
                  )}
                  <Text style={styles.small}>Requested: {new Date(p.created_at).toLocaleString()}</Text>

                  {p.status === "pending" && (
                    <View style={styles.actionsRow}>
                      <Pressable
                        onPress={() => handleProcessPayout(p.id, "approve")}
                        style={[styles.btnAction, { backgroundColor: colors.success }]}
                        disabled={actionLoading === p.id}
                      >
                        <Ionicons name="checkmark-circle" size={15} color="#fff" />
                        <Text style={styles.btnActionText}>Settle IMPS/UPI</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleProcessPayout(p.id, "reject")}
                        style={[styles.btnAction, { backgroundColor: colors.error }]}
                        disabled={actionLoading === p.id}
                      >
                        <Ionicons name="close-circle" size={15} color="#fff" />
                        <Text style={styles.btnActionText}>Reject & Refund</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {/* ==================== 6. MAINTENANCE CONTROLS ==================== */}

        {tab === "maintenance" && (
          <View style={{ gap: spacing.md }}>
            <Text style={styles.sectionHeader}>Database & Marketplace Hygiene</Text>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Auto-Expire Past Rides</Text>
              <Text style={styles.small}>
                Scans all rides with status 'open' where departure time has passed and marks them completed.
              </Text>
              <View style={styles.actionsRow}>
                <Pressable
                  onPress={handleCleanupExpiredRides}
                  style={[styles.btnAction, { backgroundColor: colors.brandPrimary }]}
                  disabled={actionLoading === "cleanup"}
                >
                  <Ionicons name="time" size={16} color="#fff" />
                  <Text style={styles.btnActionText}>Run Cleanup Expired Rides</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Reconcile & Repair Ride Seat Counts</Text>
              <Text style={styles.small}>
                Recalculates seats_available for all open rides based on active accepted bookings to prevent negative seats.
              </Text>
              <View style={styles.actionsRow}>
                <Pressable
                  onPress={handleFixSeats}
                  style={[styles.btnAction, { backgroundColor: colors.info }]}
                  disabled={actionLoading === "fix_seats"}
                >
                  <Ionicons name="sync" size={16} color="#fff" />
                  <Text style={styles.btnActionText}>Reconcile Seat Counts</Text>
                </Pressable>
              </View>
            </View>
          </View>
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
  refreshBtn: { padding: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary },
  title: { ...type.h2, fontSize: 20 },
  subtitle: { ...type.caption, color: colors.onSurfaceSecondary },
  tabsRow: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    flexShrink: 0,
  },
  tabActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  tabText: { fontSize: 11, fontWeight: "700", color: colors.onSurfaceSecondary, letterSpacing: 0.8 },
  tabTextActive: { color: "#fff" },

  sectionHeader: { fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, color: colors.onSurfaceSecondary },

  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  stat: {
    width: "47%",
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  statValue: { fontSize: 26, fontWeight: "800", color: colors.onSurface },
  statLabel: { fontSize: 11, color: colors.onSurfaceSecondary, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "700" },

  financeCard: {
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  financeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  financeLabel: { fontSize: 13, color: colors.onSurfaceSecondary, fontWeight: "600" },
  financeValue: { fontSize: 16, fontWeight: "800", color: colors.onSurface },

  filterRow: { flexDirection: "row", gap: spacing.sm },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: { backgroundColor: colors.onSurface, borderColor: colors.onSurface },
  filterChipText: { fontSize: 11, fontWeight: "700", color: colors.onSurfaceSecondary },
  filterChipTextActive: { color: "#fff" },

  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    gap: spacing.sm,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.onSurface },

  card: { padding: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, gap: 4 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },

  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, fontSize: 10, fontWeight: "800", overflow: "hidden" },
  badgeSuccess: { backgroundColor: "#E8F5E9", color: colors.success },
  badgeWarning: { backgroundColor: "#FFF8E1", color: colors.warning },
  badgeDanger: { backgroundColor: "#FFEBEE", color: colors.error },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  badgeText: { fontSize: 10, fontWeight: "800" },
  cardSub: { fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 2 },

  pill: { backgroundColor: colors.brandTertiary, color: colors.brandPrimary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, fontSize: 11, fontWeight: "800" },
  small: { fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 2 },

  actionsRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  btnAction: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.md,
    gap: 6,
  },
  btnActionText: { color: "#fff", fontSize: 12, fontWeight: "700" },

  emptyCard: { padding: spacing.xxl, backgroundColor: colors.surface, borderRadius: radius.md, alignItems: "center", gap: spacing.sm },
  emptyText: { fontSize: 14, color: colors.onSurfaceSecondary, fontWeight: "600" },
});

