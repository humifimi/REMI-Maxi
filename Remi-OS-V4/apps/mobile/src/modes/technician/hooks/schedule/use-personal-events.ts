import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";
import { api, franchiseApi } from "@technician/api/client";
import { Endpoints, FranchiseEndpoints } from "@technician/api/endpoints";
import { useAuthStore } from "@/src/stores/auth";
import { UserRole } from "@technician/types/enums";
import { calendarKeys } from "@technician/hooks/schedule/use-calendar";
import type {
  PersonalEvent,
  CreatePersonalEventPayload,
} from "@technician/types/calendar";

function useCalendarApiClient() {
  const role = useAuthStore((s) => s.user?.role);
  const isFranchise = role === UserRole.FRANCHISE_OWNER;
  return { isFranchise };
}

/**
 * Pull the most useful human-readable string off whatever shape the
 * API client surfaced. Backend errors travel back as
 * `{ success: false, error: { message, code, ... } }`; the api client
 * usually attaches that as `err.response.data.error.message` (axios
 * shape) or `err.message`. Falls back to the raw error string so an
 * unexpected shape still surfaces *something* in the Alert instead of
 * "[object Object]".
 */
function extractErrorMessage(err: unknown, fallback: string): string {
  if (!err) return fallback;
  if (typeof err === "string") return err;
  const anyErr = err as {
    response?: { data?: { error?: { message?: string } } };
    message?: string;
  };
  return (
    anyErr.response?.data?.error?.message ?? anyErr.message ?? fallback
  );
}

export function useCreatePersonalEvent() {
  const queryClient = useQueryClient();
  const { isFranchise } = useCalendarApiClient();

  return useMutation({
    mutationFn: (payload: CreatePersonalEventPayload) =>
      isFranchise
        ? franchiseApi<PersonalEvent>(
            "post",
            FranchiseEndpoints.calendarV2.createPersonalEvent,
            payload,
          )
        : api<PersonalEvent>(
            "post",
            Endpoints.calendar.createPersonalEvent,
            payload,
          ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.all });
    },
    onError: (err: unknown) => {
      const message = extractErrorMessage(
        err,
        "Failed to create personal event.",
      );
      console.warn("[PE:create] failed", { err, message });
      Alert.alert("Couldn't create event", message);
    },
  });
}

export function useUpdatePersonalEvent() {
  const queryClient = useQueryClient();
  const { isFranchise } = useCalendarApiClient();

  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Partial<CreatePersonalEventPayload>;
    }) =>
      isFranchise
        ? franchiseApi<PersonalEvent>(
            "put",
            FranchiseEndpoints.calendarV2.updatePersonalEvent(id),
            payload,
          )
        : api<PersonalEvent>(
            "put",
            Endpoints.calendar.updatePersonalEvent(id),
            payload,
          ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.all });
    },
    onError: (err: unknown) => {
      const message = extractErrorMessage(
        err,
        "Failed to update personal event.",
      );
      console.warn("[PE:update] failed", { err, message });
      Alert.alert("Couldn't update event", message);
    },
  });
}

export function useDeletePersonalEvent() {
  const queryClient = useQueryClient();
  const { isFranchise } = useCalendarApiClient();

  return useMutation({
    mutationFn: (id: string) =>
      isFranchise
        ? franchiseApi<{ deleted: true }>(
            "delete",
            FranchiseEndpoints.calendarV2.deletePersonalEvent(id),
          )
        : api<{ deleted: true }>(
            "delete",
            Endpoints.calendar.deletePersonalEvent(id),
          ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.all });
    },
    onError: (err: unknown) => {
      const message = extractErrorMessage(
        err,
        "Failed to delete personal event.",
      );
      console.warn("[PE:delete] failed", { err, message });
      Alert.alert("Couldn't delete event", message);
    },
  });
}
