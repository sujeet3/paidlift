import { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, router } from "expo-router";

import { api } from "@/src/api";
import { useUser } from "@/src/context/user";
import { colors, spacing, radius, type } from "@/src/theme";

export default function Wallet() {
  const { user, refresh } = useUser();
  const [wallet, setWallet] = useState<{ balance: number; transactions: any[] }>({ balance: 0, transactions: [] });
  const [hasDriverPlus, setHasDriverPlus] = useState(false);
  const [loading, setLoading] = useState(false);
  const [topupOpen, setTopupOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [amount, setAmount] = useState("500");
  const [withdrawAmount, setWithdrawAmount] = useState("200");
  const [payoutMethod, setPayoutMethod] = useState<"upi" | "bank_account">("upi");
  const [upiId, setUpiId] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [saving, setSaving] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [provider, setProvider] = useState<"razorpay" | "phonepe">("razorpay");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const w = await api.getWallet(user.id);
      setWallet(w);
      const sub = await api.getUserSubscription(user.id);
      setHasDriverPlus(sub.has_driver_plus);
    } catch {}
    setLoading(false);
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const doTopUp = async () => {
    if (!user) return;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    setSaving(true);
    try {
      const order = await api.createPaymentOrder({
        provider,
        purpose: "wallet_topup",
        user_id: user.id,
        amount: amt,
      });
      setTopupOpen(false);
      router.push({
        pathname: "/checkout",
        params: {
          payment_id: order.payment_id,
          checkout_url: order.checkout_url,
          provider: order.provider,
          simulated: String(order.simulated),
          return_path: "/(tabs)/wallet",
        },
      });
    } catch (e: any) {
      Alert.alert("Failed", e.message);
    }
    setSaving(false);
  };

  const doWithdraw = async () => {
    if (!user) return;
    const amt = parseFloat(withdrawAmount);
    if (!amt || amt < 200) {
      return Alert.alert("Minimum Limit", "Minimum withdrawal amount is ₹200.");
    }
    if (amt > wallet.balance) {
      return Alert.alert("Insufficient Balance", "You cannot withdraw more than your available balance.");
    }
    if (payoutMethod === "upi" && !upiId.includes("@")) {
      return Alert.alert("Invalid UPI", "Please enter a valid UPI ID (e.g., driver@okaxis).");
    }
    if (payoutMethod === "bank_account" && (!accountNumber || !ifsc)) {
      return Alert.alert("Missing Details", "Please enter your Account Number and IFSC Code.");
    }

    setWithdrawing(true);
    try {
      await api.requestPayout({
        user_id: user.id,
        amount: amt,
        payout_method: payoutMethod,
        upi_id: upiId,
        account_number: accountNumber,
        ifsc,
        beneficiary_name: beneficiaryName || user.name,
      });
      setWithdrawOpen(false);
      Alert.alert("Payout Requested", `₹${amt} withdrawal request submitted successfully. Processing via IMPS/UPI.`);
      await load();
      if (refresh) await refresh();
    } catch (e: any) {
      Alert.alert("Withdrawal Failed", e.message);
    }
    setWithdrawing(false);
  };

  const subscribeDriverPlus = async () => {
    if (!user) return;
    try {
      const order = await api.createPaymentOrder({
        provider: "razorpay",
        purpose: "driver_plus" as any,
        user_id: user.id,
        amount: 99,
      });
      router.push({
        pathname: "/checkout",
        params: {
          payment_id: order.payment_id,
          checkout_url: order.checkout_url,
          provider: order.provider,
          simulated: String(order.simulated),
          return_path: "/(tabs)/wallet",
        },
      });
    } catch (e: any) {
      Alert.alert("Failed", e.message);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Wallet</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl }}>
        <View style={styles.balanceCard} testID="wallet-balance-card">
          <Text style={styles.balanceLabel}>Available balance</Text>
          <Text style={styles.balance}>₹{wallet.balance.toFixed(2)}</Text>
          <View style={styles.actionsRow}>
            <Pressable
              testID="wallet-topup-button"
              style={styles.actionBtn}
              onPress={() => setTopupOpen(true)}
            >
              <Ionicons name="add-circle" size={18} color="#fff" />
              <Text style={styles.actionText}>Add Money</Text>
            </Pressable>
            <Pressable
              testID="wallet-withdraw-button"
              style={[styles.actionBtn, styles.actionGhost]}
              onPress={() => setWithdrawOpen(true)}
            >
              <Ionicons name="arrow-down-circle" size={18} color={colors.brandPrimary} />
              <Text style={[styles.actionText, { color: colors.brandPrimary }]}>Withdraw</Text>
            </Pressable>
          </View>
        </View>

        {/* Driver Plus Membership Banner */}
        <View style={styles.driverPlusCard}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="sparkles" size={16} color="#FFD700" />
              <Text style={styles.driverPlusTitle}>Driver Plus {hasDriverPlus ? "Active" : "(₹99/mo)"}</Text>
            </View>
            <Text style={styles.driverPlusSub}>
              {hasDriverPlus
                ? "You enjoy 0% platform commission on your rides this month!"
                : "Get 0% platform fee on first 20 rides + priority search badge."}
            </Text>
          </View>
          {!hasDriverPlus && (
            <Pressable style={styles.upgradeBtn} onPress={subscribeDriverPlus}>
              <Text style={styles.upgradeBtnText}>Upgrade</Text>
            </Pressable>
          )}
        </View>

        <Text style={styles.sectionLabel}>Recent transactions</Text>
        {loading && wallet.transactions.length === 0 && (
          <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.lg }} />
        )}
        {!loading && wallet.transactions.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="receipt-outline" size={40} color={colors.onSurfaceTertiary} />
            <Text style={styles.emptyText}>No transactions yet</Text>
          </View>
        )}
        {wallet.transactions.map((t) => (
          <View key={t.id} style={styles.txn} testID={`txn-${t.id}`}>
            <View style={[styles.txnIcon, { backgroundColor: t.amount > 0 ? "#E8F5E9" : "#FFEBEE" }]}>
              <Ionicons
                name={t.amount > 0 ? "arrow-down" : "arrow-up"}
                size={16}
                color={t.amount > 0 ? colors.success : colors.error}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.txnLabel}>{labelFor(t.kind)}</Text>
              <Text style={styles.txnMeta}>{new Date(t.created_at).toLocaleString()}</Text>
              {!!t.note && <Text style={styles.txnNote}>{t.note}</Text>}
            </View>
            <Text style={[styles.txnAmt, { color: t.amount > 0 ? colors.success : colors.onSurface }]}>
              {t.amount > 0 ? "+" : ""}₹{t.amount.toFixed(2)}
            </Text>
          </View>
        ))}
      </ScrollView>

      {/* Topup Modal */}
      <Modal transparent visible={topupOpen} animationType="slide" onRequestClose={() => setTopupOpen(false)}>
        <KeyboardAvoidingView
          style={styles.modalBg}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add money to wallet</Text>
            <Text style={styles.modalSub}>Secure gateway checkout via Razorpay or PhonePe.</Text>
            <TextInput
              testID="topup-amount-input"
              style={styles.modalInput}
              keyboardType="number-pad"
              value={amount}
              onChangeText={setAmount}
              placeholder="Amount ₹"
              placeholderTextColor={colors.onSurfaceTertiary}
            />
            <View style={styles.presetRow}>
              {[100, 500, 1000, 2000].map((v) => (
                <Pressable key={v} style={styles.preset} onPress={() => setAmount(String(v))} testID={`preset-${v}`}>
                  <Text style={styles.presetText}>₹{v}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.gwLabel}>Pay via</Text>
            <View style={styles.gwRow}>
              <Pressable
                testID="gateway-razorpay"
                onPress={() => setProvider("razorpay")}
                style={[styles.gwOpt, provider === "razorpay" && styles.gwOptActive]}
              >
                <Ionicons name="card" size={18} color={provider === "razorpay" ? colors.onBrandPrimary : colors.onSurfaceSecondary} />
                <Text style={[styles.gwOptText, provider === "razorpay" && { color: colors.onBrandPrimary }]}>Razorpay</Text>
                <Text style={[styles.gwOptSub, provider === "razorpay" && { color: colors.onBrandPrimary }]}>UPI / Cards / NB</Text>
              </Pressable>
              <Pressable
                testID="gateway-phonepe"
                onPress={() => setProvider("phonepe")}
                style={[styles.gwOpt, provider === "phonepe" && styles.gwOptActive]}
              >
                <Ionicons name="phone-portrait" size={18} color={provider === "phonepe" ? colors.onBrandPrimary : colors.onSurfaceSecondary} />
                <Text style={[styles.gwOptText, provider === "phonepe" && { color: colors.onBrandPrimary }]}>PhonePe</Text>
                <Text style={[styles.gwOptSub, provider === "phonepe" && { color: colors.onBrandPrimary }]}>UPI-first</Text>
              </Pressable>
            </View>
            <Pressable testID="topup-confirm-button" style={styles.modalBtn} onPress={doTopUp} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalBtnText}>Add ₹{amount}</Text>}
            </Pressable>
            <Pressable onPress={() => setTopupOpen(false)} style={{ padding: spacing.md, alignItems: "center" }}>
              <Text style={{ color: colors.onSurfaceSecondary, fontWeight: "600" }}>Cancel</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Withdraw Modal */}
      <Modal transparent visible={withdrawOpen} animationType="slide" onRequestClose={() => setWithdrawOpen(false)}>
        <KeyboardAvoidingView
          style={styles.modalBg}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Withdraw Earnings</Text>
            <Text style={styles.modalSub}>Minimum withdrawal limit: ₹200. Transferred via UPI or IMPS.</Text>
            <TextInput
              testID="withdraw-amount-input"
              style={styles.modalInput}
              keyboardType="number-pad"
              value={withdrawAmount}
              onChangeText={setWithdrawAmount}
              placeholder="Amount ₹"
              placeholderTextColor={colors.onSurfaceTertiary}
            />

            <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.md }}>
              <Pressable
                onPress={() => setPayoutMethod("upi")}
                style={[styles.preset, payoutMethod === "upi" && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}
              >
                <Text style={[styles.presetText, payoutMethod === "upi" && { color: "#fff" }]}>UPI ID</Text>
              </Pressable>
              <Pressable
                onPress={() => setPayoutMethod("bank_account")}
                style={[styles.preset, payoutMethod === "bank_account" && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}
              >
                <Text style={[styles.presetText, payoutMethod === "bank_account" && { color: "#fff" }]}>Bank Account</Text>
              </Pressable>
            </View>

            {payoutMethod === "upi" ? (
              <TextInput
                style={[styles.modalInput, { fontSize: 15, textAlign: "left", marginTop: spacing.md }]}
                value={upiId}
                onChangeText={setUpiId}
                placeholder="Enter UPI ID (e.g. driver@upi)"
                placeholderTextColor={colors.onSurfaceTertiary}
              />
            ) : (
              <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
                <TextInput
                  style={[styles.modalInput, { fontSize: 15, textAlign: "left", marginTop: 0 }]}
                  value={accountNumber}
                  onChangeText={setAccountNumber}
                  placeholder="Bank Account Number"
                  placeholderTextColor={colors.onSurfaceTertiary}
                  keyboardType="number-pad"
                />
                <TextInput
                  style={[styles.modalInput, { fontSize: 15, textAlign: "left", marginTop: 0 }]}
                  value={ifsc}
                  onChangeText={setIfsc}
                  placeholder="IFSC Code (e.g. SBIN0001234)"
                  placeholderTextColor={colors.onSurfaceTertiary}
                  autoCapitalize="characters"
                />
                <TextInput
                  style={[styles.modalInput, { fontSize: 15, textAlign: "left", marginTop: 0 }]}
                  value={beneficiaryName}
                  onChangeText={setBeneficiaryName}
                  placeholder="Beneficiary Account Holder Name"
                  placeholderTextColor={colors.onSurfaceTertiary}
                />
              </View>
            )}

            <Pressable testID="withdraw-confirm-button" style={styles.modalBtn} onPress={doWithdraw} disabled={withdrawing}>
              {withdrawing ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalBtnText}>Withdraw ₹{withdrawAmount}</Text>}
            </Pressable>
            <Pressable onPress={() => setWithdrawOpen(false)} style={{ padding: spacing.md, alignItems: "center" }}>
              <Text style={{ color: colors.onSurfaceSecondary, fontWeight: "600" }}>Cancel</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function labelFor(kind: string) {
  switch (kind) {
    case "topup": return "Wallet top-up";
    case "ride_payment": return "Ride payment";
    case "ride_earning": return "Ride earning";
    case "commission": return "Platform fee";
    case "withdraw": return "Driver Withdrawal";
    case "subscription": return "Driver Plus (₹99)";
    case "referral_bonus": return "Referral Reward 🎉";
    case "ride_refund": return "Ride Refund ↩";
    default: return kind;
  }
}


const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  header: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, backgroundColor: colors.surface },
  title: { ...type.h1 },
  balanceCard: {
    backgroundColor: colors.onSurface,
    borderRadius: radius.lg,
    padding: spacing.xl,
  },
  balanceLabel: { color: "rgba(255,255,255,0.7)", fontSize: 13 },
  balance: { color: "#fff", fontSize: 36, fontWeight: "800", marginTop: 4 },
  actionsRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.brandPrimary,
    paddingVertical: 13,
    borderRadius: radius.md,
  },
  actionGhost: { backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: colors.brandPrimary },
  actionText: { color: "#fff", fontWeight: "700" },
  sectionLabel: { ...type.label, marginTop: spacing.xl, marginBottom: spacing.md },
  empty: { alignItems: "center", padding: spacing.xl },
  emptyText: { ...type.bodySm, marginTop: spacing.sm },
  txn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  txnIcon: { width: 36, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  txnLabel: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  txnMeta: { fontSize: 11, color: colors.onSurfaceTertiary, marginTop: 2 },
  txnNote: { fontSize: 11, color: colors.onSurfaceSecondary, marginTop: 2 },
  txnAmt: { fontWeight: "800", fontSize: 15 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: colors.surface,
    padding: spacing.xl,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  modalTitle: { ...type.h2 },
  modalSub: { ...type.bodySm, marginTop: 4 },
  modalInput: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 20,
    fontWeight: "800",
    color: colors.onSurface,
    marginTop: spacing.lg,
    textAlign: "center",
  },
  presetRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  preset: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    borderRadius: radius.md,
    alignItems: "center",
  },
  presetText: { fontWeight: "700", color: colors.onSurface },
  modalBtn: {
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: spacing.lg,
  },
  modalBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  gwLabel: { ...type.label, marginTop: spacing.lg, marginBottom: spacing.sm },
  gwRow: { flexDirection: "row", gap: spacing.md },
  gwOpt: { flex: 1, padding: spacing.md, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, alignItems: "center", gap: 4 },
  gwOptActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  gwOptText: { fontWeight: "800", color: colors.onSurface, fontSize: 14, marginTop: 2 },
  gwOptSub: { fontSize: 11, color: colors.onSurfaceSecondary },
  driverPlusCard: {
    backgroundColor: "#1A237E",
    borderRadius: radius.md,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: "#3949AB",
  },
  driverPlusTitle: { color: "#fff", fontWeight: "800", fontSize: 14 },
  driverPlusSub: { color: "#C5CAE9", fontSize: 11, marginTop: 2 },
  upgradeBtn: {
    backgroundColor: "#FFD700",
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.sm,
  },
  upgradeBtnText: { color: "#1A237E", fontWeight: "800", fontSize: 12 },
});

