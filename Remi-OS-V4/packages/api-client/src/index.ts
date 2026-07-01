/**
 * API clients — technician (default) and customer mode.
 */
export { default as technicianApiClient } from '../../../apps/mobile/src/api/client';
export { queryClient as technicianQueryClient } from '../../../apps/mobile/src/api/query-client';

export { default as customerApiClient } from '../../../apps/mobile/src/modes/customer/api/client';
export { ENDPOINTS as customerEndpoints } from '../../../apps/mobile/src/modes/customer/api/endpoints';
export {
  getApiBaseUrl as getCustomerApiBaseUrl,
  setApiBaseUrl as setCustomerApiBaseUrl,
} from '../../../apps/mobile/src/modes/customer/constants/config';
