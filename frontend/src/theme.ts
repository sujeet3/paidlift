export const colors = {
  surface: "#FFFFFF",
  onSurface: "#1A1B1F",
  surfaceSecondary: "#F5F6F8",
  onSurfaceSecondary: "#4A4D55",
  surfaceTertiary: "#EBECEF",
  onSurfaceTertiary: "#71747E",
  surfaceInverse: "#1A1B1F",
  onSurfaceInverse: "#FFFFFF",
  brand: "#EF6C00",
  brandPrimary: "#EF6C00",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#FFE0B2",
  onBrandSecondary: "#E65100",
  brandTertiary: "#FFF3E0",
  onBrandTertiary: "#EF6C00",
  success: "#2E7D32",
  warning: "#F57C00",
  error: "#D32F2F",
  info: "#0277BD",
  border: "#E0E2E7",
  borderStrong: "#C2C5CD",
  divider: "#EBECEF",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  sm: 6,
  md: 12,
  lg: 20,
  pill: 999,
};

export const shadow = {
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
};

export const type = {
  h1: { fontSize: 28, fontWeight: "700" as const, color: colors.onSurface, letterSpacing: -0.3 },
  h2: { fontSize: 22, fontWeight: "700" as const, color: colors.onSurface, letterSpacing: -0.2 },
  h3: { fontSize: 18, fontWeight: "600" as const, color: colors.onSurface },
  body: { fontSize: 15, color: colors.onSurface },
  bodySm: { fontSize: 13, color: colors.onSurfaceSecondary },
  caption: { fontSize: 12, color: colors.onSurfaceTertiary },
  label: { fontSize: 12, fontWeight: "600" as const, color: colors.onSurfaceSecondary, letterSpacing: 0.4, textTransform: "uppercase" as const },
};

export const VEHICLE_TYPES = [
  { key: "two-wheeler", label: "2-Wheeler", icon: "bicycle" as const, seats: 1 },
  { key: "auto", label: "Auto", icon: "car-sport" as const, seats: 3 },
  { key: "sedan", label: "Sedan", icon: "car" as const, seats: 4 },
  { key: "suv", label: "SUV", icon: "car-outline" as const, seats: 6 },
  { key: "bus", label: "Bus/Tempo", icon: "bus" as const, seats: 15 },
  { key: "luxury", label: "Luxury", icon: "diamond" as const, seats: 4 },
];
