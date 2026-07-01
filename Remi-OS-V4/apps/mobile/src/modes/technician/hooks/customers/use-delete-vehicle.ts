import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@technician/api/client";
import { Alert } from "react-native";

export function useDeleteVehicle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (vehicleId: number) => {
      console.log('[DELETE-VEHICLE] Attempting to delete vehicle:', vehicleId);
      try {
        const response = await apiClient.delete(`/vehicles/${vehicleId}`);
        console.log('[DELETE-VEHICLE] Success:', response.data);
        return response.data;
      } catch (err: any) {
        console.error('[DELETE-VEHICLE] Error:', {
          status: err.response?.status,
          message: err.response?.data?.message,
          data: err.response?.data,
          url: err.config?.url,
        });
        throw err;
      }
    },
    onSuccess: (_, vehicleId) => {
      console.log('[DELETE-VEHICLE] onSuccess, invalidating queries');
      // Invalidate customer queries that might show this vehicle
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      
      Alert.alert("Success", "Vehicle deleted successfully");
    },
    onError: (error: any) => {
      console.error('[DELETE-VEHICLE] onError:', error);
      const message = error.response?.data?.message || error.message || "Failed to delete vehicle";
      Alert.alert("Error", message);
    },
  });
}
