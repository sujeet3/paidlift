import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useUser } from "@/src/context/user";
import { colors, spacing, radius, type } from "@/src/theme";

const HERO = "https://images.unsplash.com/photo-1521136095380-08fbd7be93c8?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NzB8MHwxfHNlYXJjaHwxfHxoaWdod2F5JTIwZHJpdmluZyUyMGNhciUyMHN1bnNldCUyMHdhcm18ZW58MHx8fHwxNzg2MDg5ODgzfDA&ixlib=rb-4.1.0&q=85";

type Step = "phone" | "otp" | "profile" | "aadhaar" | "role";

export default function Onboarding() {
  const { setUser } = useUser();
  const [step, setStep] = useState<Step>("phone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [aadhaar, setAadhaar] = useState("");
  const [aadhaarOtp, setAadhaarOtp] = useState("");
  const [role, setRole] = useState<"passenger" | "owner">("passenger");
  const [tempUserId, setTempUserId] = useState<string>("");

  const sendOtp = async () => {
    if (phone.length < 10) return setError("Enter a valid phone number");
    setError("");
    setLoading(true);
    try {
      await api.sendOtp(phone);
      setStep("otp");
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const verifyOtp = async () => {
    setError("");
    setLoading(true);
    try {
      const { user } = await api.verifyOtp(phone, otp);
      setTempUserId(user.id);
      if (user.name) {
        await setUser(user);
        router.replace("/(tabs)/home");
      } else {
        setStep("profile");
      }
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const saveProfile = async () => {
    if (!name.trim()) return setError("Please enter your name");
    setError("");
    setStep("aadhaar");
  };

  const verifyAadhaar = async () => {
    if (aadhaar.length !== 12) return setError("Enter 12-digit Aadhaar number");
    if (aadhaarOtp !== "123456") return setError("Aadhaar OTP is 123456 for demo");
    setError("");
    setStep("role");
  };

  const finish = async () => {
    setLoading(true);
    try {
      const updated = await api.upsertUser({
        phone,
        name,
        email,
        aadhaar_last4: aadhaar.slice(-4),
        role,
      });
      await setUser(updated);
      router.replace("/(tabs)/home");
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.heroSection}>
          <Image source={HERO} style={styles.hero} contentFit="cover" />
          <LinearGradient
            colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.88)"]}
            style={styles.scrim}
          />
          <SafeAreaView style={styles.headerArea} edges={["top"]}>
            <View style={styles.brandBadge}>
              <Image
                source={require("@/assets/images/logo.png")}
                style={styles.brandLogo}
                contentFit="contain"
              />
            </View>
            <Text style={styles.headline}>Share the ride.{"\n"}Split the cost.</Text>
            <Text style={styles.sub}>India&apos;s peer-to-peer highway rideshare — Aadhaar-verified drivers, fair pricing.</Text>
          </SafeAreaView>
        </View>

        <View style={styles.sheet}>
          <SafeAreaView edges={["bottom"]} style={{ flex: 1 }}>
            {step === "phone" && (
              <View testID="step-phone">
                <Text style={styles.stepTitle}>Enter your mobile number</Text>
                <Text style={styles.stepSub}>We&apos;ll send you a verification code.</Text>
                <View style={styles.inputRow}>
                  <Text style={styles.countryCode}>+91</Text>
                  <TextInput
                    testID="phone-input"
                    style={styles.input}
                    placeholder="10-digit mobile"
                    placeholderTextColor={colors.onSurfaceTertiary}
                    keyboardType="number-pad"
                    maxLength={10}
                    value={phone}
                    onChangeText={setPhone}
                  />
                </View>
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <PrimaryButton testID="send-otp-button" label="Send OTP" onPress={sendOtp} loading={loading} />
              </View>
            )}

            {step === "otp" && (
              <View testID="step-otp">
                <Text style={styles.stepTitle}>Verify OTP</Text>
                <Text style={styles.stepSub}>
                  Demo OTP: <Text style={{ color: colors.brand, fontWeight: "700" }}>123456</Text>
                </Text>
                <TextInput
                  testID="otp-input"
                  style={[styles.input, styles.otpInput]}
                  placeholder="6-digit OTP"
                  placeholderTextColor={colors.onSurfaceTertiary}
                  keyboardType="number-pad"
                  maxLength={6}
                  value={otp}
                  onChangeText={setOtp}
                />
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <PrimaryButton testID="verify-otp-button" label="Verify" onPress={verifyOtp} loading={loading} />
                <Pressable onPress={() => setStep("phone")} style={styles.linkBtn}>
                  <Text style={styles.linkText}>Change number</Text>
                </Pressable>
              </View>
            )}

            {step === "profile" && (
              <View testID="step-profile">
                <Text style={styles.stepTitle}>Tell us about you</Text>
                <TextInput
                  testID="name-input"
                  style={styles.input}
                  placeholder="Full name"
                  placeholderTextColor={colors.onSurfaceTertiary}
                  value={name}
                  onChangeText={setName}
                />
                <TextInput
                  testID="email-input"
                  style={[styles.input, { marginTop: spacing.md }]}
                  placeholder="Email (optional)"
                  placeholderTextColor={colors.onSurfaceTertiary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={email}
                  onChangeText={setEmail}
                />
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <PrimaryButton testID="save-profile-button" label="Continue" onPress={saveProfile} />
              </View>
            )}

            {step === "aadhaar" && (
              <View testID="step-aadhaar">
                <Text style={styles.stepTitle}>Aadhaar verification</Text>
                <Text style={styles.stepSub}>
                  Required for trust & safety. Demo: any 12 digits + OTP <Text style={{ color: colors.brand, fontWeight: "700" }}>123456</Text>.
                </Text>
                <TextInput
                  testID="aadhaar-input"
                  style={styles.input}
                  placeholder="12-digit Aadhaar"
                  placeholderTextColor={colors.onSurfaceTertiary}
                  keyboardType="number-pad"
                  maxLength={12}
                  value={aadhaar}
                  onChangeText={setAadhaar}
                />
                <TextInput
                  testID="aadhaar-otp-input"
                  style={[styles.input, { marginTop: spacing.md }]}
                  placeholder="Aadhaar OTP"
                  placeholderTextColor={colors.onSurfaceTertiary}
                  keyboardType="number-pad"
                  maxLength={6}
                  value={aadhaarOtp}
                  onChangeText={setAadhaarOtp}
                />
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <PrimaryButton testID="verify-aadhaar-button" label="Verify Aadhaar" onPress={verifyAadhaar} />
              </View>
            )}

            {step === "role" && (
              <View testID="step-role">
                <Text style={styles.stepTitle}>How will you use PAID LIFT?</Text>
                <RoleCard
                  testID="role-passenger"
                  active={role === "passenger"}
                  onPress={() => setRole("passenger")}
                  icon="person"
                  title="I want to Find a Ride"
                  sub="Book empty seats on someone else's route"
                />
                <RoleCard
                  testID="role-owner"
                  active={role === "owner"}
                  onPress={() => setRole("owner")}
                  icon="car-sport"
                  title="I want to Offer a Ride"
                  sub="Fill empty seats & earn on your trip"
                />
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <PrimaryButton testID="finish-onboarding-button" label="Get Started" onPress={finish} loading={loading} />
              </View>
            )}
          </SafeAreaView>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function PrimaryButton({ label, onPress, loading, testID }: any) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [
        styles.btn,
        { opacity: pressed || loading ? 0.85 : 1 },
      ]}
    >
      {loading ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.btnText}>{label}</Text>}
    </Pressable>
  );
}

function RoleCard({ active, onPress, icon, title, sub, testID }: any) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={[
        styles.roleCard,
        active && { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
      ]}
    >
      <View style={[styles.roleIcon, active && { backgroundColor: colors.brandPrimary }]}>
        <Ionicons name={icon} size={22} color={active ? colors.onBrandPrimary : colors.brandPrimary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.roleTitle}>{title}</Text>
        <Text style={styles.roleSub}>{sub}</Text>
      </View>
      <Ionicons
        name={active ? "radio-button-on" : "radio-button-off"}
        size={22}
        color={active ? colors.brandPrimary : colors.onSurfaceTertiary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  scrollContent: { flexGrow: 1, backgroundColor: colors.surface },
  heroSection: { minHeight: 280, position: "relative" },
  hero: { ...StyleSheet.absoluteFillObject },
  scrim: { ...StyleSheet.absoluteFillObject },
  headerArea: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxl },
  brandBadge: {
    backgroundColor: "#ffffff",
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  brandLogo: {
    width: 130,
    height: 44,
  },
  headline: { color: "#FFF", fontSize: 32, fontWeight: "800", marginTop: spacing.md, lineHeight: 38 },
  sub: { color: "rgba(255,255,255,0.85)", marginTop: spacing.xs, fontSize: 13, lineHeight: 18 },
  sheet: {
    flex: 1,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    marginTop: -20,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxxl,
    minHeight: 380,
  },
  stepTitle: { ...type.h2, marginBottom: spacing.xs },
  stepSub: { ...type.bodySm, marginBottom: spacing.lg },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  countryCode: { fontSize: 16, color: colors.onSurface, fontWeight: "600", marginRight: spacing.sm },
  input: {
    flex: 1,
    fontSize: 16,
    color: colors.onSurface,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
  },
  otpInput: { letterSpacing: 6, textAlign: "center", fontWeight: "700" },
  error: { color: colors.error, marginTop: spacing.sm, fontSize: 13 },
  btn: {
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: spacing.lg,
  },
  btnText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 16 },
  linkBtn: { alignSelf: "center", marginTop: spacing.md, padding: spacing.sm },
  linkText: { color: colors.brandPrimary, fontWeight: "600" },
  roleCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginTop: spacing.md,
    gap: spacing.md,
    backgroundColor: colors.surface,
  },
  roleIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  roleTitle: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  roleSub: { fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 2 },
});
