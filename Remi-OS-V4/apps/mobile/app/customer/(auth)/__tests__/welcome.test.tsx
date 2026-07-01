import { Alert } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import WelcomeScreen from '../welcome';

// Replace the data-fetching hook so the screen doesn't need a QueryClient.
// Jest hoists `jest.mock` above imports, so any vars referenced in the factory
// must be prefixed with `mock` (Jest's allow-listed prefix).
const mockMutate = jest.fn();
const mockState = { isPending: false };

jest.mock('@/hooks/auth/use-auth', () => ({
  __esModule: true,
  useDemoLogin: () => ({
    mutate: (...args: unknown[]) => mockMutate(...args),
    get isPending() {
      return mockState.isPending;
    },
  }),
}));

const mockedRouter = jest.mocked(router);

beforeEach(() => {
  jest.clearAllMocks();
  mockMutate.mockReset();
  mockState.isPending = false;
});

describe('WelcomeScreen', () => {
  it('renders the brand, tagline, and primary CTAs', () => {
    render(<WelcomeScreen />);

    expect(screen.getByText('MAXI')).toBeOnTheScreen();
    expect(screen.getByText(/Mobile vehicle service/)).toBeOnTheScreen();
    expect(screen.getByText('Get Started')).toBeOnTheScreen();
    expect(screen.getByText('I Have an Account')).toBeOnTheScreen();
  });

  it('navigates to register when "Get Started" is pressed', () => {
    render(<WelcomeScreen />);

    fireEvent.press(screen.getByText('Get Started'));

    expect(mockedRouter.push).toHaveBeenCalledWith('/customer/register');
  });

  it('navigates to login when "I Have an Account" is pressed', () => {
    render(<WelcomeScreen />);

    fireEvent.press(screen.getByText('I Have an Account'));

    expect(mockedRouter.push).toHaveBeenCalledWith('/customer/login');
  });

  describe('demo login chips', () => {
    it('triggers a customer demo login with no fleetRole arg', () => {
      render(<WelcomeScreen />);

      fireEvent.press(screen.getByText('Customer'));

      expect(mockMutate).toHaveBeenCalledTimes(1);
      const [arg] = mockMutate.mock.calls[0];
      expect(arg).toBeUndefined();
    });

    it('triggers fleet manager demo login with the right arg', () => {
      render(<WelcomeScreen />);

      fireEvent.press(screen.getByText('Fleet Manager'));

      const [arg] = mockMutate.mock.calls[0];
      expect(arg).toEqual({ fleetRole: 'fleet_manager' });
    });

    it('triggers fleet driver demo login with the right arg', () => {
      render(<WelcomeScreen />);

      fireEvent.press(screen.getByText('Fleet Driver'));

      const [arg] = mockMutate.mock.calls[0];
      expect(arg).toEqual({ fleetRole: 'fleet_driver' });
    });

    it('shows an Alert when demo login errors', () => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      render(<WelcomeScreen />);

      fireEvent.press(screen.getByText('Customer'));

      const options = mockMutate.mock.calls[0][1] as { onError: (e: unknown) => void };
      options.onError({
        response: { data: { message: 'Demo accounts are disabled' } },
      });

      expect(alertSpy).toHaveBeenCalledWith('Demo Unavailable', 'Demo accounts are disabled');
      alertSpy.mockRestore();
    });

    it('falls back to a generic message when error has no body', () => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      render(<WelcomeScreen />);

      fireEvent.press(screen.getByText('Customer'));
      const options = mockMutate.mock.calls[0][1] as { onError: (e: unknown) => void };
      options.onError({});

      expect(alertSpy).toHaveBeenCalledWith('Demo Unavailable', 'Demo login failed');
      alertSpy.mockRestore();
    });

    it('shows a loading indicator while the demo login is pending', () => {
      mockState.isPending = true;
      render(<WelcomeScreen />);

      expect(screen.getByText('Loading demo...')).toBeOnTheScreen();
    });

    it('does not show the loading indicator when idle', () => {
      render(<WelcomeScreen />);

      expect(screen.queryByText('Loading demo...')).toBeNull();
    });
  });
});
