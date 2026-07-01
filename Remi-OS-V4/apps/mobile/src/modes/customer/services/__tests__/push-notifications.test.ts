/**
 * Tests for the push-notifications service. Because the module calls
 * `Notifications.setNotificationHandler` at import time, we re-import via
 * `jest.isolateModules` in tests where we want to assert that side-effect.
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { router } from 'expo-router';

const mockedNotifications = jest.mocked(Notifications);
const mockedRouter = jest.mocked(router);

beforeEach(() => {
  jest.clearAllMocks();
  // Default permission state for each test.
  mockedNotifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
  mockedNotifications.requestPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
  mockedNotifications.getExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[abc]' } as never);
  // Force device flag back to true (some tests override it).
  Object.defineProperty(Device, 'isDevice', { value: true, configurable: true });
});

describe('module side effects', () => {
  it('registers a notification handler on import', () => {
    jest.isolateModules(() => {
      // Re-require to trigger the top-level setNotificationHandler call.
      require('@/services/push-notifications');
    });
    expect(mockedNotifications.setNotificationHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        handleNotification: expect.any(Function),
      }),
    );
  });
});

describe('getExpoPushToken', () => {
  it('returns null on a simulator (Device.isDevice = false)', async () => {
    Object.defineProperty(Device, 'isDevice', { value: false, configurable: true });
    const { getExpoPushToken } = require('@/services/push-notifications');

    await expect(getExpoPushToken()).resolves.toBeNull();
    expect(mockedNotifications.getPermissionsAsync).not.toHaveBeenCalled();
  });

  it('returns null when the user denies permissions', async () => {
    mockedNotifications.getPermissionsAsync.mockResolvedValueOnce({ status: 'undetermined' } as never);
    mockedNotifications.requestPermissionsAsync.mockResolvedValueOnce({ status: 'denied' } as never);

    const { getExpoPushToken } = require('@/services/push-notifications');

    await expect(getExpoPushToken()).resolves.toBeNull();
    expect(mockedNotifications.requestPermissionsAsync).toHaveBeenCalled();
    expect(mockedNotifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it('skips the permission prompt when already granted', async () => {
    const { getExpoPushToken } = require('@/services/push-notifications');

    const token = await getExpoPushToken();

    expect(token).toBe('ExponentPushToken[abc]');
    expect(mockedNotifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(mockedNotifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(1);
  });

  it('creates an Android notification channel on Android', async () => {
    const originalOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });

    try {
      const { getExpoPushToken } = require('@/services/push-notifications');
      await getExpoPushToken();

      expect(mockedNotifications.setNotificationChannelAsync).toHaveBeenCalledWith(
        'default',
        expect.objectContaining({
          name: 'Default',
          importance: Notifications.AndroidImportance.HIGH,
        }),
      );
    } finally {
      Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
    }
  });

  it('does not create a channel on iOS', async () => {
    const originalOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });

    try {
      const { getExpoPushToken } = require('@/services/push-notifications');
      await getExpoPushToken();
      expect(mockedNotifications.setNotificationChannelAsync).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
    }
  });
});

describe('setupNotificationResponseHandler', () => {
  function captureHandler() {
    let captured: ((response: unknown) => void) | undefined;
    mockedNotifications.addNotificationResponseReceivedListener.mockImplementationOnce(
      (handler) => {
        captured = handler as (response: unknown) => void;
        return { remove: jest.fn() } as never;
      },
    );
    const { setupNotificationResponseHandler } = require('@/services/push-notifications');
    setupNotificationResponseHandler();
    if (!captured) throw new Error('Handler was not registered');
    return captured;
  }

  function fakeResponse(data: Record<string, unknown> | undefined) {
    return { notification: { request: { content: { data } } } };
  }

  it('navigates to the vehicle screen when vehicleId is present', () => {
    const handler = captureHandler();
    handler(fakeResponse({ vehicleId: 42 }));

    expect(mockedRouter.push).toHaveBeenCalledWith('/customer/vehicle/42');
  });

  it('appends highlightComponents query when degradedComponents is set', () => {
    const handler = captureHandler();
    handler(fakeResponse({ vehicleId: 42, degradedComponents: 'oil,brakes' }));

    expect(mockedRouter.push).toHaveBeenCalledWith(
      '/customer/vehicle/42?highlightComponents=oil,brakes',
    );
  });

  it('does nothing when there is no vehicleId in the payload', () => {
    const handler = captureHandler();
    handler(fakeResponse({ type: 'system' }));
    handler(fakeResponse(undefined));

    expect(mockedRouter.push).not.toHaveBeenCalled();
  });
});
