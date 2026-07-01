/**
 * P5-CU-2 — Home-tab badge unit tests. Drives the chunk-prompt's
 * "verify ... badge" requirement across the 0 / 1 / 5 (and 99+) cases
 * without dragging the Home tab's full hook surface into the test.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { InboxBadgeButton } from '@customer/components/inbox/inbox-badge-button';

describe('InboxBadgeButton (P5-CU-2)', () => {
  it('hides the badge when count is 0 (zero case)', () => {
    render(<InboxBadgeButton count={0} onPress={() => {}} />);
    expect(screen.queryByTestId('home-inbox-badge')).not.toBeOnTheScreen();
    expect(screen.getByTestId('home-inbox-button')).toBeOnTheScreen();
  });

  it('shows "1" for a single pending session (one case)', () => {
    render(<InboxBadgeButton count={1} onPress={() => {}} />);
    expect(screen.getByTestId('home-inbox-badge')).toBeOnTheScreen();
    expect(screen.getByText('1')).toBeOnTheScreen();
  });

  it('shows "5" for five pending sessions (five case)', () => {
    render(<InboxBadgeButton count={5} onPress={() => {}} />);
    expect(screen.getByText('5')).toBeOnTheScreen();
  });

  it('caps the visible count at 99+', () => {
    render(<InboxBadgeButton count={123} onPress={() => {}} />);
    expect(screen.getByText('99+')).toBeOnTheScreen();
  });

  it('uses a count-aware accessibility label when there are pending sessions', () => {
    render(<InboxBadgeButton count={3} onPress={() => {}} />);
    expect(
      screen.getByLabelText('3 pending changes to review'),
    ).toBeOnTheScreen();
  });

  it('uses the empty-state accessibility label when count is 0', () => {
    render(<InboxBadgeButton count={0} onPress={() => {}} />);
    expect(screen.getByLabelText('Approval inbox')).toBeOnTheScreen();
  });

  it('invokes onPress when tapped', () => {
    const onPress = jest.fn();
    render(<InboxBadgeButton count={2} onPress={onPress} />);
    fireEvent.press(screen.getByTestId('home-inbox-button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
