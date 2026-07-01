/**
 * Tests for `useCalendarTabOrientation` (P2-FE-4) — the focus/blur
 * gate that lets the calendar tab unlock to landscape and re-locks
 * portrait everywhere else (master plan §5.1.2).
 *
 * NOTE (executable spec): see the header in
 * `LandscapeWorkweekView.test.tsx` for the runner caveat — this file
 * is excluded from `tsc --noEmit` via `**\/__tests__\/**` in
 * `tsconfig.json` and treated as executable specification until the
 * `jest-expo` scaffold lands.
 */

// eslint-disable-next-line import/no-unresolved -- @testing-library/react-native lands with the jest-expo runner.
import { render } from "@testing-library/react-native";

import { useCalendarTabOrientation } from "../use-calendar-tab-orientation";

const allowAllOrientations = jest.fn();
const lockToPortrait = jest.fn();

jest.mock("@technician/utils/orientation", () => ({
  __esModule: true,
  allowAllOrientations: (...args: unknown[]) => allowAllOrientations(...args),
  lockToPortrait: (...args: unknown[]) => lockToPortrait(...args),
}));

// `useFocusEffect` from expo-router fires the effect immediately on
// mount and runs the cleanup when the consumer unmounts (i.e. blur
// for the navigator stack). Mock to that semantic so we don't pull
// in the navigation container.
jest.mock("expo-router", () => {
  const React = require("react");
  return {
    __esModule: true,
    useFocusEffect: (cb: () => void | (() => void)) => {
      // Use useEffect instead of useLayoutEffect so the mock matches
      // the public contract: "fires when screen gains focus, cleanup
      // when it loses focus".
      React.useEffect(() => cb(), [cb]);
    },
  };
});

function Harness({ enabled = true }: { enabled?: boolean }) {
  useCalendarTabOrientation({ enabled });
  return null;
}

beforeEach(() => {
  allowAllOrientations.mockReset();
  lockToPortrait.mockReset();
});

describe("useCalendarTabOrientation", () => {
  it("unlocks all orientations on focus and re-locks portrait on blur", () => {
    const node = render(<Harness />);
    expect(allowAllOrientations).toHaveBeenCalledTimes(1);
    expect(lockToPortrait).not.toHaveBeenCalled();

    node.unmount();
    expect(lockToPortrait).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when enabled=false (used by the tech calendar branch)", () => {
    const node = render(<Harness enabled={false} />);
    expect(allowAllOrientations).not.toHaveBeenCalled();
    node.unmount();
    expect(lockToPortrait).not.toHaveBeenCalled();
  });
});
