import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Pressable, AppState } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { useLocalSearchParams, router } from "expo-router";

import { api } from "@/src/api";
import { colors, spacing, radius, type } from "@/src/theme";

type Params = {
  payment_id: string;
  checkout_url: string;
  provider: string;
  simulated?: string;
  return_path?: string; // where to redirect after success
};

export default function Checkout() {
  const params = useLocalSearchParams<Params>();
  const [phase, setPhase] = useState<"opening" | "polling" | "success" | "failed" | "pending">("opening");
  const startedRef = useRef(false);
  const pollingRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      try {
        // Open hosted checkout in system browser (dismissible; works in Expo Go)
        WebBrowser.openBrowserAsync(params.checkout_url, {
          presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
          controlsColor: colors.brandPrimary,
          toolbarColor: colors.surface,
        }).catch(() => {});
      } catch {}
      // Immediately begin polling; user might come back before finishing
      setPhase("polling");
      poll();
    })();

    // Also re-poll when app returns to foreground
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") poll();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const poll = async () => {
    if (pollingRef.current) return;
    pollingRef.current = true;
    try {
      for (let i = 0; i < 30; i++) {
        const s = await api.getPaymentStatus(params.payment_id);
        if (s.status === "paid") {
          setPhase("success");
          setTimeout(() => {
            try { WebBrowser.dismissBrowser(); } catch {}
            router.replace((params.return_path as any) || "/(tabs)/wallet");
          }, 900);
          return;
        }
        if (s.status === "failed") {
          setPhase("failed");
          return;
        }
        await new Promise((r) => setTimeout(r, 2500));
      }
      setPhase("pending");
    } finally {
      pollingRef.current = false;
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <View style={styles.card} testID="checkout-screen">
        <View style={[styles.iconWrap, phase === "success" && { backgroundColor: "#E8F5E9" }, phase === "failed" && { backgroundColor: "#FFEBEE" }]}>
          {phase === "success" ? (
            <Ionicons name="checkmark-circle" size={64} color={colors.success} />
          ) : phase === "failed" ? (
            <Ionicons name="close-circle" size={64} color={colors.error} />
          ) : phase === "pending" ? (
            <Ionicons name="time" size={64} color={colors.warning} />
          ) : (
            <ActivityIndicator size="large" color={colors.brandPrimary} />
          )}
        </View>

        <Text style={styles.title}>
          {phase === "opening" && "Opening checkout…"}
          {phase === "polling" && "Waiting for payment"}
          {phase === "success" && "Payment successful"}
          {phase === "failed" && "Payment cancelled"}
          {phase === "pending" && "Still waiting…"}
        </Text>
        <Text style={styles.sub}>
          {phase === "polling" && `Complete the payment in the ${labelFor(params.provider)} window, then return here.`}
          {phase === "success" && "Redirecting…"}
          {phase === "failed" && "No amount was charged. You can try again."}
          {phase === "pending" && "Your bank is taking longer than usual. You can check back later."}
        </Text>

        {params.simulated === "true" && phase !== "success" && (
          <View style={styles.simBanner} testID="sim-banner">
            <Ionicons name="flask" size={14} color={colors.warning} />
            <Text style={styles.simText}>Sandbox mode — no real money is charged.</Text>
          </View>
        )}

        {(phase === "failed" || phase === "pending") && (
          <>
            <Pressable style={styles.btn} onPress={() => router.back()} testID="checkout-back">
              <Text style={styles.btnText}>Go Back</Text>
            </Pressable>
            {phase === "pending" && (
              <Pressable style={[styles.btn, styles.btnGhost]} onPress={poll} testID="checkout-refresh">
                <Text style={[styles.btnText, { color: colors.brandPrimary }]}>Check status again</Text>
              </Pressable>
            )}
          </>
        )}

        {phase === "polling" && (
          <Pressable style={[styles.btn, styles.btnGhost]} onPress={() => WebBrowser.openBrowserAsync(params.checkout_url).catch(() => {})} testID="checkout-reopen">
            <Text style={[styles.btnText, { color: colors.brandPrimary }]}>Re-open payment page</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

function labelFor(p: string) {
  if (p === "razorpay") return "Razorpay";
  if (p === "phonepe") return "PhonePe";
  return "payment";
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary, justifyContent: "center", padding: spacing.xl },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xxl, alignItems: "center", borderWidth: 1, borderColor: colors.border },
  iconWrap: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", marginBottom: spacing.lg },
  title: { ...type.h2, textAlign: "center" },
  sub: { ...type.bodySm, textAlign: "center", marginTop: spacing.sm, lineHeight: 20 },
  simBanner: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.lg, backgroundColor: "#FFF3E0", paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill },
  simText: { fontSize: 12, color: colors.warning, fontWeight: "700" },
  btn: { marginTop: spacing.lg, backgroundColor: colors.brandPrimary, paddingVertical: 14, borderRadius: radius.md, alignSelf: "stretch", alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  btnGhost: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: colors.brandPrimary, marginTop: spacing.sm },
});
