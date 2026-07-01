import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@technician/api/client";
import { Alert } from "react-native";
import { useRouter } from "expo-router";

export function useDeleteCustomer() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: async (customerId: number) => {
      console.log('[DELETE-CUSTOMER] Attempting to delete customer:', customerId);
      try {
        const response = await apiClient.delete(`/customers/${customerId}`);
        console.log('[DELETE-CUSTOMER] Success:', response.data);
        return response.data;
      } catch (err: any) {
        console.error('[DELETE-CUSTOMER] Error:', {
          status: err.response?.status,
          message: err.response?.data?.message,
          data: err.response?.data,
          url: err.config?.url,
        });
        throw err;
      }
    },
    onSuccess: () => {
      console.log('[DELETE-CUSTOMER] onSuccess, invalidating queries and navigating');
      // Invalidate customer list
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      
      Alert.alert("Success", "Customer deleted successfully");
      
      // Navigate back to customer list
      router.replace("/(tabs)/customers");
    },
    onError: (error: any) => {
      console.error('[DELETE-CUSTOMER] onError:', error);
      const message = error.response?.data?.message || error.message || "Failed to delete customer";
      Alert.alert("Error", message);
    },
  });
}
