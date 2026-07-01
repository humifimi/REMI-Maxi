import { useMutation } from "@tanstack/react-query";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import type { DecodedVehicle, Vehicle } from "@technician/types/api";

export function useDecodeVehicle() {
  return useMutation({
    mutationFn: async (data: {
      identifier: string;
      type: "vin" | "plate";
      plate_state?: string;
    }) => {
      console.log("[job-flow] decode vehicle request", data);
      const result = await api<DecodedVehicle>(
        "post",
        Endpoints.jobs.decodeVehicle,
        data,
      );
      console.log("[job-flow] decode vehicle response", {
        identifier: data.identifier,
        vin: result.vin,
        year: result.year,
        make: result.make,
        model: result.model,
      });
      return result;
    },
  });
}

export function useFindOrCreateVehicle() {
  return useMutation({
    mutationFn: async (data: {
      user_id: number;
      vin?: string;
      license_plate?: string;
      license_plate_state?: string;
      year?: number;
      make?: string;
      model?: string;
      engine?: string;
      mileage?: number;
      color?: string;
    }) => {
      return api<Vehicle>("post", Endpoints.vehicles.findOrCreate, data);
    },
  });
}
