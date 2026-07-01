/**
 * P5-CU-6 — covers the decline-with-reason picker:
 *   - the radio renders all 5 §5.4.5 reason kinds
 *   - submitting without picking a kind shows the validation error
 *   - submitting with "Other" but empty free-text shows the text-error
 *   - submitting valid form fires `useRespondToReorganizationSession()`
 *     with the right wire body (decline_reason_text omitted when blank,
 *     included + trimmed when non-blank)
 *   - on success, the screen dismisses BOTH the picker and the parent
 *     action sheet via router.dismiss(2)
 *   - on error, the screen STAYS open (customer-app override #4) and
 *     the user can retry
 *
 * The hook itself's URL/body contract + invalidation behavior is locked
 * in `src/hooks/reorganizations/__tests__/use-session-detail.test.tsx`
 * — those tests already assert that `mutate({ action: 'decline', ... })`
 * POSTs to `/reorganizations/:id/respond` with the right snake_case
 * body. We don't re-derive the wire shape here; the test obligations
 * "submit body shape" + "mutation invalidates the inbox query on
 * success" are jointly covered (hook test for URL+invalidation, screen
 * test for the args the screen passes to the hook).
 */

/* eslint-disable import/first -- jest.mock must hoist above the imports
   that trigger them; placing them at the top of the file keeps the
   mocks active when the component-under-test imports the hook. */
jest.mock('@/hooks/reorganizations/use-session-detail', () => ({
  useRespondToReorganizationSession: jest.fn(),
}));

import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import DeclineReasonScreen, {
  DECLINE_REASON_KINDS,
  declineFormSchema,
} from '@customer/../app/inbox/approvals/[sessionId]/decline';
import { useRespondToReorganizationSession } from '@customer/hooks/reorganizations/use-session-detail';

const useRespondHook = useRespondToReorganizationSession as jest.MockedFunction<
  typeof useRespondToReorganizationSession
>;

type RespondResult = ReturnType<typeof useRespondToReorganizationSession>;

function makeRespond(overrides: Partial<RespondResult> = {}): RespondResult {
  return {
    mutate: jest.fn(),
    isPending: false,
    variables: undefined,
    ...overrides,
  } as unknown as RespondResult;
}

beforeEach(() => {
  useRespondHook.mockReset();
  (useLocalSearchParams as jest.Mock).mockReset();
  (useLocalSearchParams as jest.Mock).mockReturnValue({ sessionId: '42' });
  (router.push as jest.Mock).mockReset();
  (router.back as jest.Mock).mockReset();
  (router.replace as jest.Mock).mockReset();
  (router.dismiss as jest.Mock).mockReset();
  (router.canGoBack as jest.Mock).mockReturnValue(true);
});

describe('DeclineReasonScreen — radio group (P5-CU-6)', () => {
  it('renders all 5 §5.4.5 reason kinds in the canonical order', () => {
    useRespondHook.mockReturnValue(makeRespond());

    render(<DeclineReasonScreen />);

    // The exported enum order matches the §5.4.5 table top-to-bottom;
    // the rendered labels match the table's left column verbatim.
    expect(DECLINE_REASON_KINDS.map((k) => k.value)).toEqual([
      'inconvenient_time',
      'wrong_technician',
      'vehicle_unavailable',
      'conflicting_commitment',
      'other',
    ]);

    expect(screen.getByTestId('decline-reason-inconvenient_time')).toBeOnTheScreen();
    expect(screen.getByTestId('decline-reason-wrong_technician')).toBeOnTheScreen();
    expect(screen.getByTestId('decline-reason-vehicle_unavailable')).toBeOnTheScreen();
    expect(screen.getByTestId('decline-reason-conflicting_commitment')).toBeOnTheScreen();
    expect(screen.getByTestId('decline-reason-other')).toBeOnTheScreen();

    expect(screen.getByText('Inconvenient time')).toBeOnTheScreen();
    expect(screen.getByText('Wrong technician')).toBeOnTheScreen();
    expect(screen.getByText('Vehicle not available')).toBeOnTheScreen();
    expect(screen.getByText('Conflicting commitment')).toBeOnTheScreen();
    expect(screen.getByText('Other')).toBeOnTheScreen();
  });

  it('marks the picked option as accessibility-state selected', () => {
    useRespondHook.mockReturnValue(makeRespond());

    render(<DeclineReasonScreen />);
    fireEvent.press(screen.getByTestId('decline-reason-inconvenient_time'));

    const row = screen.getByTestId('decline-reason-inconvenient_time');
    expect(row.props.accessibilityState).toMatchObject({ selected: true });
  });
});

describe('DeclineReasonScreen — validation (P5-CU-6)', () => {
  it('shows the kind-required error when submitting without picking a radio', async () => {
    const respondMutate = jest.fn();
    useRespondHook.mockReturnValue(makeRespond({ mutate: respondMutate } as any));

    render(<DeclineReasonScreen />);
    fireEvent.press(screen.getByTestId('decline-submit-btn'));

    await waitFor(() =>
      expect(screen.getByTestId('decline-reason-kind-error')).toBeOnTheScreen(),
    );
    expect(respondMutate).not.toHaveBeenCalled();
  });

  it('requires the free-text field when "Other" is selected', async () => {
    const respondMutate = jest.fn();
    useRespondHook.mockReturnValue(makeRespond({ mutate: respondMutate } as any));

    render(<DeclineReasonScreen />);
    fireEvent.press(screen.getByTestId('decline-reason-other'));
    fireEvent.press(screen.getByTestId('decline-submit-btn'));

    await waitFor(() =>
      expect(screen.getByTestId('decline-reason-text-error')).toBeOnTheScreen(),
    );
    expect(respondMutate).not.toHaveBeenCalled();
  });

  it('does NOT require the free-text field for non-"other" kinds', async () => {
    const respondMutate = jest.fn();
    useRespondHook.mockReturnValue(makeRespond({ mutate: respondMutate } as any));

    render(<DeclineReasonScreen />);
    fireEvent.press(screen.getByTestId('decline-reason-inconvenient_time'));
    fireEvent.press(screen.getByTestId('decline-submit-btn'));

    await waitFor(() => expect(respondMutate).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('decline-reason-text-error')).not.toBeOnTheScreen();
  });
});

describe('DeclineReasonScreen — submit body shape (P5-CU-6)', () => {
  it('omits decline_reason_text when the free-text field is blank', async () => {
    const respondMutate = jest.fn();
    useRespondHook.mockReturnValue(makeRespond({ mutate: respondMutate } as any));

    render(<DeclineReasonScreen />);
    fireEvent.press(screen.getByTestId('decline-reason-inconvenient_time'));
    fireEvent.press(screen.getByTestId('decline-submit-btn'));

    await waitFor(() => expect(respondMutate).toHaveBeenCalledTimes(1));
    expect(respondMutate.mock.calls[0][0]).toEqual({
      sessionId: 42,
      action: 'decline',
      declineReasonKind: 'inconvenient_time',
      declineReasonText: undefined,
    });
  });

  it('trims the free-text and forwards it as declineReasonText', async () => {
    const respondMutate = jest.fn();
    useRespondHook.mockReturnValue(makeRespond({ mutate: respondMutate } as any));

    render(<DeclineReasonScreen />);
    fireEvent.press(screen.getByTestId('decline-reason-other'));
    fireEvent.changeText(
      screen.getByTestId('decline-reason-text-input'),
      '   6am is too early for me   ',
    );
    fireEvent.press(screen.getByTestId('decline-submit-btn'));

    await waitFor(() => expect(respondMutate).toHaveBeenCalledTimes(1));
    expect(respondMutate.mock.calls[0][0]).toEqual({
      sessionId: 42,
      action: 'decline',
      declineReasonKind: 'other',
      declineReasonText: '6am is too early for me',
    });
  });

  it('rejects free-text longer than 500 chars (matches BE schema cap)', async () => {
    const respondMutate = jest.fn();
    useRespondHook.mockReturnValue(makeRespond({ mutate: respondMutate } as any));

    // The TextInput maxLength prop caps input visually, but the schema
    // is the source of truth — sanity-check it directly. (Schema is
    // exported precisely so the test can assert the BE-mirrored cap
    // without juggling the maxLength prop in RN.)
    const result = declineFormSchema.safeParse({
      decline_reason_kind: 'inconvenient_time',
      decline_reason_text: 'x'.repeat(501),
    });
    expect(result.success).toBe(false);
  });
});

describe('DeclineReasonScreen — close behavior (P5-CU-6)', () => {
  it('on submit success, dismisses BOTH the picker and the parent action sheet', async () => {
    const respondMutate = jest.fn((_vars, opts) => opts?.onSuccess?.());
    useRespondHook.mockReturnValue(makeRespond({ mutate: respondMutate } as any));

    render(<DeclineReasonScreen />);
    fireEvent.press(screen.getByTestId('decline-reason-inconvenient_time'));
    fireEvent.press(screen.getByTestId('decline-submit-btn'));

    await waitFor(() => expect(respondMutate).toHaveBeenCalled());
    // dismiss(2) pops both modal screens — the picker AND the action
    // sheet — landing the user back on the inbox modal.
    expect(router.dismiss).toHaveBeenCalledWith(2);
  });

  it('on submit error, STAYS on the screen (customer-app override #4)', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const respondMutate = jest.fn((_vars, opts) =>
      opts?.onError?.(new Error('Network down')),
    );
    useRespondHook.mockReturnValue(makeRespond({ mutate: respondMutate } as any));

    render(<DeclineReasonScreen />);
    fireEvent.press(screen.getByTestId('decline-reason-inconvenient_time'));
    fireEvent.press(screen.getByTestId('decline-submit-btn'));

    await waitFor(() => expect(respondMutate).toHaveBeenCalled());
    expect(alertSpy).toHaveBeenCalled();
    expect(router.dismiss).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  it('close button pops one level (back to action sheet) without submitting', () => {
    useRespondHook.mockReturnValue(makeRespond());

    render(<DeclineReasonScreen />);
    fireEvent.press(screen.getByTestId('decline-close-button'));

    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.dismiss).not.toHaveBeenCalled();
  });
});

describe('declineFormSchema (P5-CU-6)', () => {
  it('accepts each of the 5 §5.4.5 reason kinds', () => {
    for (const k of DECLINE_REASON_KINDS) {
      const result = declineFormSchema.safeParse({
        decline_reason_kind: k.value,
        // "other" needs free-text; everything else is fine empty.
        decline_reason_text: k.value === 'other' ? 'because' : '',
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects an unknown reason kind', () => {
    // Guards against a future agent following the chunk-prompt body's
    // alternate enum (`prefer_original_tech`, `no_longer_needed`,
    // `cost_concern`) — see
    // docs/PLAN-DEVIATIONS.md#2026-05-02-decline-reason-kind-enum.
    const result = declineFormSchema.safeParse({
      decline_reason_kind: 'cost_concern',
      decline_reason_text: '',
    });
    expect(result.success).toBe(false);
  });
});
