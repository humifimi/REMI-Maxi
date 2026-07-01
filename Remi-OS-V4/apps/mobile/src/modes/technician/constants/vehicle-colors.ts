/**
 * Standard vehicle color options for manual entry.
 * Ensures consistent color names across the app.
 */

export const VEHICLE_COLORS = [
  // Whites & Silvers
  { label: "White", value: "White", hex: "#FFFFFF" },
  { label: "Pearl White", value: "Pearl White", hex: "#F5F5F0" },
  { label: "Off-White", value: "Off-White", hex: "#FAF0E6" },
  { label: "Silver", value: "Silver", hex: "#C0C0C0" },
  { label: "Gray", value: "Gray", hex: "#808080" },
  { label: "Charcoal", value: "Charcoal", hex: "#36454F" },

  // Blacks
  { label: "Black", value: "Black", hex: "#000000" },
  { label: "Jet Black", value: "Jet Black", hex: "#0A0A0A" },

  // Reds
  { label: "Red", value: "Red", hex: "#CC0000" },
  { label: "Crimson", value: "Crimson", hex: "#DC143C" },
  { label: "Burgundy", value: "Burgundy", hex: "#800020" },

  // Blues
  { label: "Blue", value: "Blue", hex: "#0066CC" },
  { label: "Navy", value: "Navy", hex: "#000080" },
  { label: "Light Blue", value: "Light Blue", hex: "#87CEEB" },

  // Greens
  { label: "Green", value: "Green", hex: "#228B22" },
  { label: "Forest Green", value: "Forest Green", hex: "#013220" },
  { label: "Olive", value: "Olive", hex: "#808000" },

  // Browns & Tans
  { label: "Brown", value: "Brown", hex: "#8B4513" },
  { label: "Beige", value: "Beige", hex: "#F5F5DC" },
  { label: "Tan", value: "Tan", hex: "#D2B48C" },
  { label: "Gold", value: "Gold", hex: "#CFB53B" },

  // Others
  { label: "Orange", value: "Orange", hex: "#FF6600" },
  { label: "Yellow", value: "Yellow", hex: "#FFD700" },
  { label: "Purple", value: "Purple", hex: "#6A0DAD" },
  { label: "Pink", value: "Pink", hex: "#FF69B4" },
] as const;

export type VehicleColor = typeof VEHICLE_COLORS[number]["value"];
