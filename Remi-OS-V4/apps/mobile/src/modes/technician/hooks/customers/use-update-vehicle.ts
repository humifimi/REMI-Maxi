import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@technician/api/client";
import { Alert } from "react-native";

interface UpdateVehicleData {
  color?: string | null;
  mileage?: number | null;
  nickname?: string | null;
  license_plate_state?: string | null;
}

export function useUpdateVehicle() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ vehicleId, data }: { vehicleId: number; data: UpdateVehicleData }) => {
      const response = await apiClient.patch(`/vehicles/${vehicleId}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      Alert.alert("Success", "Vehicle updated successfully");
    },
    onError: (error: any) => {
      Alert.alert("Error", error.response?.data?.message || "Failed to update vehicle");
    },
  });
}
