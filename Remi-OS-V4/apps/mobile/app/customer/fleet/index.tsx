import { FleetDashboardContent } from '@customer/components/fleet/fleet-dashboard-content';
import { useFleetManagerGuard } from '@customer/components/fleet/fleet-manager-guard';

export default function FleetDashboardScreen() {
  const allowed = useFleetManagerGuard();
  if (!allowed) return null;
  return <FleetDashboardContent />;
}
