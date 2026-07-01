import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@customer/api/client';
import { ENDPOINTS } from '@customer/api/endpoints';
import type { ApiResponse } from '@customer/types/api';
import type {
  FleetApprovalRequest,
  FleetApprovalReviewRequest,
  DriverServiceRequestPayload,
} from '@customer/types/fleet';

function buildMockApprovals(): FleetApprovalRequest[] {
  const now = new Date();
  return [
    {
      id: 1,
      fleet_company_id: 1,
      vehicle_id: 2,
      vehicle_name: '2022 Chevrolet Express',
      driver_id: 2,
      driver_name: 'Priya Sharma',
      requested_by: 2,
      reviewed_by: null,
      request_type: 'driver_request',
      service_ids: [3],
      service_description: 'Brake Pad Replacement',
      deferred_work_item_id: null,
      estimated_cost: 189.99,
      status: 'pending',
      review_note: null,
      requested_at: new Date(now.getTime() - 5 * 3600000).toISOString(),
      reviewed_at: null,
    },
    {
      id: 2,
      fleet_company_id: 1,
      vehicle_id: 3,
      vehicle_name: '2021 RAM ProMaster',
      driver_id: 3,
      driver_name: 'Jake Lawson',
      requested_by: 0,
      reviewed_by: null,
      request_type: 'deferred_work',
      service_ids: [5],
      service_description: 'Tire Replacement — Front Left',
      deferred_work_item_id: 202,
      estimated_cost: 149.99,
      status: 'pending',
      review_note: null,
      requested_at: new Date(now.getTime() - 24 * 3600000).toISOString(),
      reviewed_at: null,
    },
    {
      id: 3,
      fleet_company_id: 1,
      vehicle_id: 1,
      vehicle_name: '2023 Ford Transit',
      driver_id: 1,
      driver_name: 'Marcus Rivera',
      requested_by: 0,
      reviewed_by: null,
      request_type: 'due_soon_suggestion',
      service_ids: [1],
      service_description: 'Oil Change — Due in 15 days',
      deferred_work_item_id: null,
      estimated_cost: 64.99,
      status: 'pending',
      review_note: null,
      requested_at: new Date(now.getTime() - 48 * 3600000).toISOString(),
      reviewed_at: null,
    },
    {
      id: 4,
      fleet_company_id: 1,
      vehicle_id: 4,
      vehicle_name: '2024 Ford E-Transit',
      driver_id: 4,
      driver_name: 'Aisha Patel',
      requested_by: 4,
      reviewed_by: 1,
      request_type: 'driver_request',
      service_ids: [2],
      service_description: 'Tire Rotation',
      deferred_work_item_id: null,
      estimated_cost: 49.99,
      status: 'approved',
      review_note: null,
      requested_at: new Date(now.getTime() - 72 * 3600000).toISOString(),
      reviewed_at: new Date(now.getTime() - 60 * 3600000).toISOString(),
    },
    {
      id: 5,
      fleet_company_id: 1,
      vehicle_id: 5,
      vehicle_name: '2023 Mercedes-Benz Sprinter',
      driver_id: null,
      driver_name: null,
      requested_by: 0,
      reviewed_by: 1,
      request_type: 'deferred_work',
      service_ids: [7],
      service_description: 'Coolant Flush',
      deferred_work_item_id: 203,
      estimated_cost: 39.99,
      status: 'denied',
      review_note: 'Deferring until next quarter budget cycle.',
      requested_at: new Date(now.getTime() - 96 * 3600000).toISOString(),
      reviewed_at: new Date(now.getTime() - 80 * 3600000).toISOString(),
    },
  ];
}

// TODO: Replace mock with GET /customer/fleet/approvals when backend BE-24 is ready
export function useFleetApprovals() {
  return useQuery({
    queryKey: ['fleetApprovals'],
    queryFn: async (): Promise<FleetApprovalRequest[]> => {
      try {
        const { data } = await apiClient.get<ApiResponse<FleetApprovalRequest[]>>(
          ENDPOINTS.FLEET.APPROVALS,
        );
        return data.data;
      } catch {
        return buildMockApprovals();
      }
    },
    staleTime: 30_000,
  });
}

// TODO: Replace mock with PUT /customer/fleet/approvals/:id when backend BE-24 is ready
export function useReviewApproval() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      approvalId,
      review,
    }: {
      approvalId: number;
      review: FleetApprovalReviewRequest;
    }): Promise<FleetApprovalRequest> => {
      try {
        const { data } = await apiClient.put<ApiResponse<FleetApprovalRequest>>(
          ENDPOINTS.FLEET.REVIEW_APPROVAL(approvalId),
          review,
        );
        return data.data;
      } catch {
        const all = buildMockApprovals();
        const item = all.find((a) => a.id === approvalId) ?? all[0];
        return {
          ...item,
          status: review.action === 'approve' ? 'approved' : 'denied',
          review_note: review.review_note ?? null,
          reviewed_at: new Date().toISOString(),
        };
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fleetApprovals'] });
      queryClient.invalidateQueries({ queryKey: ['fleetDashboard'] });
    },
  });
}

// TODO: Replace mock with POST /customer/fleet/approvals when backend BE-24 is ready
export function useDriverServiceRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: DriverServiceRequestPayload): Promise<FleetApprovalRequest> => {
      try {
        const { data } = await apiClient.post<ApiResponse<FleetApprovalRequest>>(
          ENDPOINTS.FLEET.APPROVALS,
          { ...body, request_type: 'driver_request' },
        );
        return data.data;
      } catch {
        return {
          id: Date.now(),
          fleet_company_id: 1,
          vehicle_id: body.vehicle_id,
          vehicle_name: `Vehicle #${body.vehicle_id}`,
          driver_id: null,
          driver_name: null,
          requested_by: 0,
          reviewed_by: null,
          request_type: 'driver_request',
          service_ids: body.service_ids,
          service_description: body.note ?? 'Driver service request',
          deferred_work_item_id: null,
          estimated_cost: 0,
          status: 'pending',
          review_note: null,
          requested_at: new Date().toISOString(),
          reviewed_at: null,
        };
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fleetApprovals'] });
      queryClient.invalidateQueries({ queryKey: ['fleetDashboard'] });
    },
  });
}
