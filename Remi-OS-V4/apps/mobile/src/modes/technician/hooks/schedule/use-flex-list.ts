import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { franchiseApi } from "@technician/api/client";
import { FranchiseEndpoints } from "@technician/api/endpoints";
import type { FlexListStatus } from "@technician/types/enums";
import type {
  FlexListEntry,
  CreateFlexListEntryPayload,
  FlexListOfferPayload,
} from "@technician/types/calendar";

export const flexListKeys = {
  all: ["flex-list"] as const,
  byStatus: (status?: FlexListStatus) =>
    [...flexListKeys.all, status] as const,
};

export function useFlexList(status?: FlexListStatus) {
  return useQuery({
    queryKey: flexListKeys.byStatus(status),
    queryFn: () =>
      franchiseApi<FlexListEntry[]>(
        "get",
        FranchiseEndpoints.calendarV2.flexList,
        status ? { status } : undefined,
      ),
    staleTime: 30_000,
  });
}

export function useAddFlexListEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateFlexListEntryPayload) =>
      franchiseApi<FlexListEntry>(
        "post",
        FranchiseEndpoints.calendarV2.flexList,
        payload,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: flexListKeys.all });
    },
  });
}

export function useOfferFlexListSlot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload?: FlexListOfferPayload;
    }) =>
      franchiseApi<{ offered: true }>(
        "post",
        FranchiseEndpoints.calendarV2.flexListOffer(id),
        payload,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: flexListKeys.all });
    },
  });
}
