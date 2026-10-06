import { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Modal, ActivityIndicator, Alert, Linking, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect } from "expo-router";

import { api } from "@/src/api";
import { uploadFile, fileUrl } from "@/src/upload";
import { useUser } from "@/src/context/user";
import { colors, spacing, radius, type, VEHICLE_TYPES } from "@/src/theme";

const FUEL_TYPES = [
  { key: "petrol", label: "Petrol" },
  { key: "diesel", label: "Diesel" },
  { key: "cng", label: "CNG" },
  { key: "ev", label: "EV ⚡" },
];

export default function Vehicles() {
  const { user } = useUser();
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);

  // form
  const [vehicleType, setVehicleType] = useState("sedan");
  const [fuelType, setFuelType] = useState("petrol");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [plate, setPlate] = useState("");
  const [seatsTotal, setSeatsTotal] = useState("4");
  const [rc, setRc] = useState("");
  const [ins, setIns] = useState("");
  const [dl, setDl] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const v = await api.listVehicles(user.id);
      setVehicles(v);
    } catch {}
    setLoading(false);
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const create = async () => {
    if (!user) return;
    if (!plate.trim()) return Alert.alert("Missing", "Enter plate number.");
    setSaving(true);
    try {
      await api.createVehicle({
        owner_id: user.id,
        vehicle_type: vehicleType,
        fuel_type: fuelType,
        make, model, plate,
        seats_total: parseInt(seatsTotal, 10) || 4,
        rc_number: rc,
        insurance_number: ins,
        dl_number: dl,
      });
      setOpen(false);
      setMake(""); setModel(""); setPlate(""); setRc(""); setIns(""); setDl("");
      await load();
      Alert.alert("Submitted for review", "Upload RC, DL & insurance photos to get approved faster.");
    } catch (e: any) {
      Alert.alert("Failed", e.message);
    }
    setSaving(false);
  };

  const pickAndUpload = async (vehicleId: string) => {
    if (!user) return;
    // Permission flow: check → request → handle denied
    const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    let granted = perm.granted;
    if (!granted && perm.canAskAgain) {
      const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
      granted = req.granted;
    }
    if (!granted) {
      Alert.alert(
        "Photo access needed",
        "Allow gallery access to upload your RC, DL and insurance photos for verification.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.6,
      allowsEditing: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setUploadingFor(vehicleId);
    try {
      await uploadFile({
        uri: asset.uri,
        user_id: user.id,
        kind: "vehicle_doc",
        ref_id: vehicleId,
        fileName: asset.fileName || "doc.jpg",
        mimeType: asset.mimeType || "image/jpeg",
      });
      await load();
    } catch (e: any) {
      Alert.alert("Upload failed", "Please try again on a stable connection.");
    }
    setUploadingFor(null);
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} testID="back-button"><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></Pressable>
        <Text style={styles.title}>My Vehicles</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.md, paddingBottom: 120 }}>
        {loading && <ActivityIndicator color={colors.brandPrimary} />}
        {!loading && vehicles.length === 0 && (
          <View style={styles.empty} testID="vehicles-empty">
            <Ionicons name="car-outline" size={48} color={colors.onSurfaceTertiary} />
            <Text style={styles.emptyText}>No vehicles yet</Text>
            <Text style={styles.emptySub}>Add your first vehicle to start offering rides.</Text>
          </View>
        )}
        {vehicles.map((v) => (
          <View key={v.id} style={styles.card} testID={`vehicle-${v.id}`}>
            <View style={styles.cardTop}>
              <View style={styles.vIcon}>
                <Ionicons name={VEHICLE_TYPES.find((x) => x.key === v.vehicle_type)?.icon || "car"} size={22} color={colors.brandPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={styles.vTitle}>{v.make} {v.model}</Text>
                  {v.fuel_type === "ev" && (
                    <View style={styles.evPill}><Ionicons name="leaf" size={10} color={colors.success} /><Text style={styles.evText}>EV</Text></View>
                  )}
                </View>
                <Text style={styles.vSub}>{v.plate} · {v.seats_total} seats · {VEHICLE_TYPES.find((x) => x.key === v.vehicle_type)?.label}</Text>
              </View>
              {v.approved ? (
                <View style={styles.approved}><Ionicons name="checkmark-circle" size={12} color={colors.success} /><Text style={styles.approvedText}>Approved</Text></View>
              ) : (
                <View style={[styles.approved, { backgroundColor: "#FFF3E0" }]} testID={`vehicle-pending-${v.id}`}><Ionicons name="time" size={12} color={colors.warning} /><Text style={[styles.approvedText, { color: colors.warning }]}>Pending</Text></View>
              )}
            </View>

            {/* Doc photos */}
            <View style={styles.docRow}>
              {Object.entries(v.doc_photos || {}).slice(0, 3).map(([k, path]: any) => (
                <Image key={k} source={fileUrl(path)} style={styles.docThumb} contentFit="cover" />
              ))}
              <Pressable
                testID={`upload-doc-${v.id}`}
                style={styles.uploadBtn}
                onPress={() => pickAndUpload(v.id)}
                disabled={uploadingFor === v.id}
              >
                {uploadingFor === v.id ? (
                  <ActivityIndicator size="small" color={colors.brandPrimary} />
                ) : (
                  <>
                    <Ionicons name="cloud-upload-outline" size={16} color={colors.brandPrimary} />
                    <Text style={styles.uploadText}>{Object.keys(v.doc_photos || {}).length ? "Add more" : "Upload RC / DL / Insurance"}</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>

      <SafeAreaView edges={["bottom"]} style={styles.ctaBar}>
        <Pressable style={styles.cta} onPress={() => setOpen(true)} testID="add-vehicle-button">
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.ctaText}>Add Vehicle</Text>
        </Pressable>
      </SafeAreaView>

      <Modal transparent visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <ScrollView contentContainerStyle={{ padding: spacing.xl }} keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>Add a Vehicle</Text>
              <Text style={styles.small}>Type</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.sm }}>
                {VEHICLE_TYPES.map((v) => {
                  const active = v.key === vehicleType;
                  return (
                    <Pressable
                      key={v.key}
                      testID={`vehicle-type-${v.key}`}
                      onPress={() => { setVehicleType(v.key); setSeatsTotal(String(v.seats)); }}
                      style={[styles.typeChip, active && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}
                    >
                      <Ionicons name={v.icon} size={14} color={active ? "#fff" : colors.onSurfaceSecondary} />
                      <Text style={[styles.typeChipText, active && { color: "#fff" }]}>{v.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Text style={styles.small}>Fuel</Text>
              <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: 4, flexWrap: "wrap" }}>
                {FUEL_TYPES.map((f) => {
                  const active = f.key === fuelType;
                  return (
                    <Pressable
                      key={f.key}
                      testID={`fuel-${f.key}`}
                      onPress={() => setFuelType(f.key)}
                      style={[styles.typeChip, active && { backgroundColor: f.key === "ev" ? colors.success : colors.brandPrimary, borderColor: active ? "transparent" : colors.border }]}
                    >
                      <Text style={[styles.typeChipText, active && { color: "#fff" }]}>{f.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Field label="Make" value={make} onChange={setMake} testID="v-make" />
              <Field label="Model" value={model} onChange={setModel} testID="v-model" />
              <Field label="Plate No." value={plate} onChange={setPlate} testID="v-plate" />
              <Field label="Total seats" value={seatsTotal} onChange={setSeatsTotal} testID="v-seats" keyboardType="number-pad" />
              <Field label="RC number" value={rc} onChange={setRc} testID="v-rc" />
              <Field label="Insurance number" value={ins} onChange={setIns} testID="v-ins" />
              <Field label="Driving License" value={dl} onChange={setDl} testID="v-dl" />
              <Pressable style={styles.modalBtn} onPress={create} disabled={saving} testID="save-vehicle-button">
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalBtnText}>Save Vehicle</Text>}
              </Pressable>
              <Pressable onPress={() => setOpen(false)} style={{ padding: spacing.md, alignItems: "center" }}>
                <Text style={{ color: colors.onSurfaceSecondary, fontWeight: "600" }}>Cancel</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Field({ label, value, onChange, testID, keyboardType }: any) {
  return (
    <View style={{ marginTop: spacing.md }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
        style={styles.fieldInput}
        placeholderTextColor={colors.onSurfaceTertiary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  header: { flexDirection: "row", alignItems: "center", padding: spacing.lg, gap: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider },
  backBtn: { padding: 4 },
  title: { ...type.h2 },
  empty: { alignItems: "center", padding: spacing.xxxl },
  emptyText: { ...type.h3, marginTop: spacing.md },
  emptySub: { ...type.bodySm, marginTop: 4 },
  card: { padding: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  vIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  vTitle: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  vSub: { fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 2 },
  approved: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#E8F5E9", paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  approvedText: { fontSize: 10, color: colors.success, fontWeight: "800" },
  evPill: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#E8F5E9", paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.pill },
  evText: { fontSize: 10, color: colors.success, fontWeight: "800" },
  docRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
  docThumb: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.surfaceSecondary },
  uploadBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: spacing.md, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.brandPrimary, borderRadius: radius.md },
  uploadText: { fontSize: 12, color: colors.brandPrimary, fontWeight: "700" },
  ctaBar: { padding: spacing.xl, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  cta: { flexDirection: "row", gap: 6, backgroundColor: colors.brandPrimary, borderRadius: radius.md, paddingVertical: 15, alignItems: "center", justifyContent: "center" },
  ctaText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: "90%" },
  modalTitle: { ...type.h2, marginBottom: spacing.md },
  typeChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, flexShrink: 0 },
  typeChipText: { fontSize: 13, fontWeight: "600", color: colors.onSurfaceSecondary },
  fieldLabel: { ...type.label, marginBottom: 4 },
  fieldInput: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, fontSize: 15, color: colors.onSurface },
  small: { ...type.label, marginTop: spacing.md },
  modalBtn: { backgroundColor: colors.brandPrimary, borderRadius: radius.md, paddingVertical: 15, alignItems: "center", marginTop: spacing.lg },
  modalBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
