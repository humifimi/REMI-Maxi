import { render, screen } from '@testing-library/react-native';
import { StatusBadge } from '@customer/components/shared/status-badge';
import { AppointmentStatus } from '@customer/types/enums';

describe('StatusBadge', () => {
  it('renders the human-readable label for a known status', () => {
    render(<StatusBadge status={AppointmentStatus.EN_ROUTE} />);

    expect(screen.getByText('Tech En Route')).toBeOnTheScreen();
  });

  it('renders different labels for different statuses', () => {
    const { rerender } = render(
      <StatusBadge status={AppointmentStatus.CREATED} />,
    );
    expect(screen.getByText('Requested')).toBeOnTheScreen();

    rerender(<StatusBadge status={AppointmentStatus.COMPLETED} />);
    expect(screen.getByText('Completed')).toBeOnTheScreen();

    rerender(<StatusBadge status={AppointmentStatus.CANCELLED} />);
    expect(screen.getByText('Cancelled')).toBeOnTheScreen();
  });
});
