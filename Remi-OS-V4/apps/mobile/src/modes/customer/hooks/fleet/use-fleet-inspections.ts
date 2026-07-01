import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@customer/api/client';
import { ENDPOINTS } from '@customer/api/endpoints';
import type { ApiResponse } from '@customer/types/api';
import type {
  FleetInspectionsData,
  FleetInspectionDetail,
  InspectionTemplate,
  InspectionSubmissionPayload,
  InspectionSubmissionResponse,
  InspectionCheckResult,
  InspectionChecklistItem,
  InspectionTemplateItem,
  PendingInspectionVehicle,
  InspectionFrequency,
} from '@customer/types/fleet';

// ---------------------------------------------------------------------------
// Mock data — TODO: Replace with API calls when backend BE-24 is ready
// ---------------------------------------------------------------------------

function buildMockInspections(): FleetInspectionsData {
  const now = new Date();

  const recent: FleetInspectionDetail[] = [
    {
      id: 1,
      vehicle_id: 1,
      vehicle_name: '2022 Ford Transit',
      license_plate: 'FLT-001',
      driver_id: 1,
      driver_name: 'Marcus Rivera',
      submitted_at: new Date(now.getTime() - 2 * 86400000).toISOString(),
      score: 92,
      flagged_items: 1,
      total_items: 9,
      status: 'flagged',
      checklist: [
        { key: 'oil_life', label: 'Oil Life', category: 'Engine', result: 'pass', photo_url: null, note: null },
        { key: 'tires', label: 'Tire Condition', category: 'Tires', result: 'pass', photo_url: null, note: null },
        { key: 'tire_pressure', label: 'Tire Pressure Light', category: 'Tires', result: 'pass', photo_url: null, note: null },
        { key: 'cel', label: 'Check Engine Light', category: 'Engine', result: 'pass', photo_url: null, note: null },
        { key: 'wipers', label: 'Wipers', category: 'Visibility', result: 'flag', photo_url: null, note: 'Streaking on driver side' },
        { key: 'headlights', label: 'Headlights', category: 'Lights', result: 'pass', photo_url: null, note: null },
        { key: 'signals', label: 'Brake/Turn Signals', category: 'Lights', result: 'pass', photo_url: null, note: null },
        { key: 'windshield', label: 'Windshield', category: 'Visibility', result: 'pass', photo_url: null, note: null },
        { key: 'brakes', label: 'Brake Feel/Sound', category: 'Brakes', result: 'pass', photo_url: null, note: null },
      ],
      voice_note_url: null,
    },
    {
      id: 2,
      vehicle_id: 4,
      vehicle_name: '2023 Toyota Tacoma',
      license_plate: 'FLT-004',
      driver_id: 4,
      driver_name: 'Aisha Patel',
      submitted_at: new Date(now.getTime() - 1 * 86400000).toISOString(),
      score: 100,
      flagged_items: 0,
      total_items: 9,
      status: 'passed',
      checklist: [
        { key: 'oil_life', label: 'Oil Life', category: 'Engine', result: 'pass', photo_url: null, note: null },
        { key: 'tires', label: 'Tire Condition', category: 'Tires', result: 'pass', photo_url: null, note: null },
        { key: 'tire_pressure', label: 'Tire Pressure Light', category: 'Tires', result: 'pass', photo_url: null, note: null },
        { key: 'cel', label: 'Check Engine Light', category: 'Engine', result: 'pass', photo_url: null, note: null },
        { key: 'wipers', label: 'Wipers', category: 'Visibility', result: 'pass', photo_url: null, note: null },
        { key: 'headlights', label: 'Headlights', category: 'Lights', result: 'pass', photo_url: null, note: null },
        { key: 'signals', label: 'Brake/Turn Signals', category: 'Lights', result: 'pass', photo_url: null, note: null },
        { key: 'windshield', label: 'Windshield', category: 'Visibility', result: 'pass', photo_url: null, note: null },
        { key: 'brakes', label: 'Brake Feel/Sound', category: 'Brakes', result: 'pass', photo_url: null, note: null },
      ],
      voice_note_url: null,
    },
  ];

  const pending: PendingInspectionVehicle[] = [
    {
      vehicle_id: 3,
      vehicle_name: '2021 RAM ProMaster',
      license_plate: 'FLT-003',
      driver_id: 3,
      driver_name: 'Jake Lawson',
      last_inspection_date: new Date(now.getTime() - 45 * 86400000).toISOString(),
      days_overdue: 15,
      inspection_frequency: 'monthly',
    },
    {
      vehicle_id: 5,
      vehicle_name: '2023 Mercedes Sprinter',
      license_plate: 'FLT-005',
      driver_id: null,
      driver_name: null,
      last_inspection_date: null,
      days_overdue: 30,
      inspection_frequency: 'monthly',
    },
  ];

  return { recent, pending };
}

const TEMPLATE_ITEMS: InspectionTemplateItem[] = [
  { key: 'oil_life', label: 'Oil Life', category: 'Engine', description: 'Check oil level and color on dipstick', icon: 'water-outline' },
  { key: 'tires', label: 'Tire Condition', category: 'Tires', description: 'Look for wear, bulges, or low tread', icon: 'ellipse-outline' },
  { key: 'tire_pressure', label: 'Tire Pressure Light', category: 'Tires', description: 'Is the TPMS light on the dashboard?', icon: 'speedometer-outline' },
  { key: 'cel', label: 'Check Engine Light', category: 'Engine', description: 'Is the check engine light illuminated?', icon: 'warning-outline' },
  { key: 'wipers', label: 'Wipers', category: 'Visibility', description: 'Test wipers — do they streak or skip?', icon: 'rainy-outline' },
  { key: 'headlights', label: 'Headlights', category: 'Lights', description: 'Turn on headlights — both working?', icon: 'flashlight-outline' },
  { key: 'signals', label: 'Brake/Turn Signals', category: 'Lights', description: 'Check brake lights and turn signals', icon: 'swap-horizontal-outline' },
  { key: 'windshield', label: 'Windshield', category: 'Visibility', description: 'Look for chips, cracks, or large debris', icon: 'car-outline' },
  { key: 'brakes', label: 'Brake Feel/Sound', category: 'Brakes', description: 'Any squealing, grinding, or spongy pedal?', icon: 'hand-left-outline' },
];

function buildMockTemplate(): InspectionTemplate {
  return {
    items: TEMPLATE_ITEMS,
    vehicle_id: null,
    vehicle_name: null,
  };
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useFleetInspections() {
  return useQuery({
    queryKey: ['fleetInspections'],
    queryFn: async (): Promise<FleetInspectionsData> => {
      try {
        const { data } = await apiClient.get<ApiResponse<FleetInspectionsData>>(
          ENDPOINTS.FLEET.INSPECTIONS,
        );
        return data.data;
      } catch {
        // TODO: Replace mock with API call when backend BE-24 is ready
        return buildMockInspections();
      }
    },
    staleTime: 30_000,
  });
}

export function useInspectionDetail(inspectionId: number | null) {
  return useQuery({
    queryKey: ['fleetInspection', inspectionId],
    queryFn: async (): Promise<FleetInspectionDetail> => {
      try {
        const { data } = await apiClient.get<ApiResponse<FleetInspectionDetail>>(
          ENDPOINTS.FLEET.INSPECTION_DETAIL(inspectionId!),
        );
        return data.data;
      } catch {
        const mock = buildMockInspections();
        const found = mock.recent.find((i) => i.id === inspectionId);
        if (found) return found;
        return mock.recent[0];
      }
    },
    enabled: inspectionId != null,
    staleTime: 30_000,
  });
}

export function useInspectionTemplate(vehicleId?: number) {
  return useQuery({
    queryKey: ['inspectionTemplate', vehicleId],
    queryFn: async (): Promise<InspectionTemplate> => {
      try {
        const { data } = await apiClient.get<ApiResponse<InspectionTemplate>>(
          ENDPOINTS.FLEET.INSPECTION_TEMPLATE,
          { params: vehicleId ? { vehicle_id: vehicleId } : undefined },
        );
        return data.data;
      } catch {
        // TODO: Replace mock with API call when backend BE-24 is ready
        return buildMockTemplate();
      }
    },
    staleTime: 120_000,
  });
}

export function useSubmitInspection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: InspectionSubmissionPayload): Promise<InspectionSubmissionResponse> => {
      try {
        const { data } = await apiClient.post<ApiResponse<InspectionSubmissionResponse>>(
          ENDPOINTS.FLEET.INSPECTIONS,
          payload,
        );
        return data.data;
      } catch {
        // TODO: Replace mock with API call when backend BE-24 is ready
        const flagged = payload.items.filter((i) => i.result === 'flag').length;
        const total = payload.items.length;
        const score = total > 0 ? Math.round(((total - flagged) / total) * 100) : 100;
        return {
          inspection_id: Date.now(),
          score,
          flagged_items: flagged,
          status: flagged === 0 ? 'passed' : 'flagged',
        };
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fleetInspections'] });
      queryClient.invalidateQueries({ queryKey: ['fleetComplianceEnhanced'] });
      queryClient.invalidateQueries({ queryKey: ['fleetCompliance'] });
    },
  });
}

export function useSendInspectionReminder() {
  return useMutation({
    mutationFn: async (vehicleId: number): Promise<void> => {
      // TODO: Replace with API call when backend BE-24 is ready
      await apiClient.post(ENDPOINTS.FLEET.INSPECTION_REMIND(vehicleId)).catch(() => {});
    },
  });
}
