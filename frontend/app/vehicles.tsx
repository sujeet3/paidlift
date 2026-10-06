import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Modal, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";

import { api } from "@/src/api";
import { useUser } from "@/src/context/user";
import { colors, spacing, radius, type, VEHICLE_TYPES } from "@/src/theme";

export default function Vehicles() {
  const { user } = useUser();
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  // form
  const [vehicleType, setVehicleType] = useState("sedan");
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
        make, model, plate,
        seats_total: parseInt(seatsTotal, 10) || 4,
        rc_number: rc,
        insurance_number: ins,
        dl_number: dl,
      });
      setOpen(false);
      setMake(""); setModel(""); setPlate(""); setRc(""); setIns(""); setDl("");
      await load();
    } catch (e: any) {
      Alert.alert("Failed", e.message);
    }
    setSaving(false);
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></Pressable>
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
            <View style={styles.vIcon}>
              <Ionicons name={VEHICLE_TYPES.find((x) => x.key === v.vehicle_type)?.icon || "car"} size={22} color={colors.brandPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.vTitle}>{v.make} {v.model}</Text>
              <Text style={styles.vSub}>{v.plate} · {v.seats_total} seats · {VEHICLE_TYPES.find((x) => x.key === v.vehicle_type)?.label}</Text>
              {v.approved && <View style={styles.approved}><Ionicons name="checkmark-circle" size={12} color={colors.success} /><Text style={styles.approvedText}>Approved</Text></View>}
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
            <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
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
  card: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  vIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  vTitle: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  vSub: { fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 2 },
  approved: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.sm, alignSelf: "flex-start", backgroundColor: "#E8F5E9", paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill },
  approvedText: { fontSize: 10, color: colors.success, fontWeight: "800" },
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
