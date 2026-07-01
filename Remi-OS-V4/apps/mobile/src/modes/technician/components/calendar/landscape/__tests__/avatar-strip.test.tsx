/**
 * Tests for `AvatarStrip` (P2-FE-4) — the vertical 44pt strip that
 * anchors the landscape workweek to the preferredHand edge.
 *
 * NOTE (executable spec): see the header in
 * `LandscapeWorkweekView.test.tsx` for the runner caveat — this file
 * is excluded from `tsc --noEmit` via `**\/__tests__\/**` in
 * `tsconfig.json` and is treated as executable specification until
 * the `jest-expo` scaffold lands.
 *
 * Coverage axes (master plan §5.1.1):
 *
 *   - Strip width is exactly 44pt (34pt avatar + 5pt padding × 2).
 *   - Filtered vs. unfiltered selection toggles the `isFiltered`
 *     prop on each chip (which dims unselected chips per the
 *     `TechAvatarChip` contract).
 *   - Tap forwards to `onToggleTech(techId)`.
 *   - Long-press forwards to `onFocusTech(techId)` only when wired.
 *   - Color tinting goes through the injected `colorForTechOverride`
 *     when provided (production path uses the real `colorForTech`).
 */

// eslint-disable-next-line import/no-unresolved -- @testing-library/react-native lands with the jest-expo runner.
import { fireEvent, render } from "@testing-library/react-native";

import {
  AvatarStrip,
  LANDSCAPE_AVATAR_DIAMETER,
  LANDSCAPE_AVATAR_PADDING,
  LANDSCAPE_AVATAR_STRIP_WIDTH,
  LANDSCAPE_SPLIT_MAX_AVATARS,
} from "../avatar-strip";

const TECHS = [
  { id: 11, name: "Alex" },
  { id: 22, name: "Bea" },
  { id: 33, name: "Cam" },
];

const makeTechs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `Tech${i + 1}`,
  }));

describe("AvatarStrip — geometry", () => {
  it("uses a 44pt strip = 34pt avatar + 5pt padding × 2 (master plan §5.1.1)", () => {
    expect(LANDSCAPE_AVATAR_STRIP_WIDTH).toBe(44);
    expect(LANDSCAPE_AVATAR_DIAMETER).toBe(34);
    expect(LANDSCAPE_AVATAR_PADDING).toBe(5);
    expect(
      LANDSCAPE_AVATAR_DIAMETER + LANDSCAPE_AVATAR_PADDING * 2,
    ).toBe(LANDSCAPE_AVATAR_STRIP_WIDTH);
  });
});

describe("AvatarStrip — selection wiring", () => {
  it("calls onToggleTech with the tech id when a chip is pressed", () => {
    const onToggleTech = jest.fn();
    const node = render(
      <AvatarStrip
        techs={TECHS}
        selectedTechIds={[]}
        onToggleTech={onToggleTech}
      />,
    );
    // Chips render their accessibilityLabel from the tech name.
    const beaChip = node.getByLabelText(/Bea/);
    fireEvent.press(beaChip);
    expect(onToggleTech).toHaveBeenCalledWith(22);
  });

  it("calls onFocusTech on long-press only when the prop is wired", () => {
    const onToggleTech = jest.fn();
    const onFocusTech = jest.fn();
    const node = render(
      <AvatarStrip
        techs={TECHS}
        selectedTechIds={[11]}
        onToggleTech={onToggleTech}
        onFocusTech={onFocusTech}
      />,
    );
    fireEvent(node.getByLabelText(/Alex/), "onLongPress");
    expect(onFocusTech).toHaveBeenCalledWith(11);
  });
});

describe("AvatarStrip — splitMiddle (notch-aware layout)", () => {
  it("splits 6 techs into 3 top + 3 bottom (ceil(N/2) + floor(N/2))", () => {
    const node = render(
      <AvatarStrip
        techs={makeTechs(6)}
        selectedTechIds={[]}
        onToggleTech={() => undefined}
        splitMiddle
      />,
    );
    const top = node.getByTestId("avatar-strip-top-group");
    const bottom = node.getByTestId("avatar-strip-bottom-group");
    expect(top.props.children).toHaveLength(3);
    expect(bottom.props.children).toHaveLength(3);
  });

  it("rounds odd counts up to the top group (5 → 3 top + 2 bottom)", () => {
    const node = render(
      <AvatarStrip
        techs={makeTechs(5)}
        selectedTechIds={[]}
        onToggleTech={() => undefined}
        splitMiddle
      />,
    );
    expect(node.getByTestId("avatar-strip-top-group").props.children).toHaveLength(3);
    expect(node.getByTestId("avatar-strip-bottom-group").props.children).toHaveLength(2);
  });

  it("falls back to a single ScrollView when count exceeds LANDSCAPE_SPLIT_MAX_AVATARS to avoid overflow on small landscape phones", () => {
    const node = render(
      <AvatarStrip
        techs={makeTechs(LANDSCAPE_SPLIT_MAX_AVATARS + 1)}
        selectedTechIds={[]}
        onToggleTech={() => undefined}
        splitMiddle
      />,
    );
    expect(node.queryByTestId("avatar-strip-split")).toBeNull();
    expect(node.queryByTestId("avatar-strip-top-group")).toBeNull();
    // Every tech still renders, just inside the scroll fallback.
    expect(
      node.getAllByLabelText(/Tech\d+/),
    ).toHaveLength(LANDSCAPE_SPLIT_MAX_AVATARS + 1);
  });

  it("default (splitMiddle=false) renders the legacy single-scroll layout — no split groups present", () => {
    const node = render(
      <AvatarStrip
        techs={makeTechs(6)}
        selectedTechIds={[]}
        onToggleTech={() => undefined}
      />,
    );
    expect(node.queryByTestId("avatar-strip-split")).toBeNull();
    expect(node.queryByTestId("avatar-strip-top-group")).toBeNull();
  });
});

describe("AvatarStrip — topOffsetSlots (date-label clearance on the primary edge-flush strip)", () => {
  it("renders an N-slot spacer (N × 44pt) above the top group when topOffsetSlots is set", () => {
    const node = render(
      <AvatarStrip
        techs={makeTechs(4)}
        selectedTechIds={[]}
        onToggleTech={() => undefined}
        splitMiddle
        topOffsetSlots={1}
      />,
    );
    const spacer = node.getByTestId("avatar-strip-top-offset");
    // 1 slot × 44pt (LANDSCAPE_AVATAR_SLOT_HEIGHT). Pushes the topmost
    // avatar down to slot 2 from the top, clearing the calendar header
    // where the date labels render.
    expect(spacer.props.style).toMatchObject({ height: 44 });
  });

  it("supports multi-slot offsets (e.g. for taller chrome above the calendar)", () => {
    const node = render(
      <AvatarStrip
        techs={makeTechs(4)}
        selectedTechIds={[]}
        onToggleTech={() => undefined}
        splitMiddle
        topOffsetSlots={2}
      />,
    );
    expect(node.getByTestId("avatar-strip-top-offset").props.style).toMatchObject({
      height: 88,
    });
  });

  it("does NOT render the spacer when topOffsetSlots is 0 / unset (avoids stray empty Views)", () => {
    const node = render(
      <AvatarStrip
        techs={makeTechs(4)}
        selectedTechIds={[]}
        onToggleTech={() => undefined}
        splitMiddle
      />,
    );
    expect(node.queryByTestId("avatar-strip-top-offset")).toBeNull();
  });

  it("ignores topOffsetSlots when splitMiddle is off (the offset is only meaningful in the split layout)", () => {
    const node = render(
      <AvatarStrip
        techs={makeTechs(4)}
        selectedTechIds={[]}
        onToggleTech={() => undefined}
        topOffsetSlots={3}
      />,
    );
    expect(node.queryByTestId("avatar-strip-top-offset")).toBeNull();
  });
});

describe("AvatarStrip — dim semantics (landscape-calendar.md §2.6 / §2.9)", () => {
  // Chip's `dim = isFiltered && !isSelected`. Style prop is a function
  // of `{pressed}` so we resolve it to the unpressed style array and
  // pluck the opacity object that lives at index 3.
  const opacityFor = (chip: { props: { style: (s: { pressed: boolean }) => unknown[] } }) => {
    const arr = chip.props.style({ pressed: false }) as Array<Record<string, unknown>>;
    const opacityEntry = arr.find(
      (entry) => entry && typeof entry === "object" && "opacity" in entry,
    );
    return opacityEntry?.opacity;
  };

  it("dims EVERY avatar when selectedTechIds is empty (landscape 0-tech = create-card surface)", () => {
    const node = render(
      <AvatarStrip
        techs={TECHS}
        selectedTechIds={[]}
        onToggleTech={() => undefined}
      />,
    );
    expect(opacityFor(node.getByLabelText(/Alex/))).toBe(0.4);
    expect(opacityFor(node.getByLabelText(/Bea/))).toBe(0.4);
    expect(opacityFor(node.getByLabelText(/Cam/))).toBe(0.4);
  });

  it("dims only the unselected avatars when one tech is selected", () => {
    const node = render(
      <AvatarStrip
        techs={TECHS}
        selectedTechIds={[22]}
        onToggleTech={() => undefined}
      />,
    );
    expect(opacityFor(node.getByLabelText(/Alex/))).toBe(0.4);
    expect(opacityFor(node.getByLabelText(/Bea/))).toBe(1);
    expect(opacityFor(node.getByLabelText(/Cam/))).toBe(0.4);
  });

  it("dims only the unselected avatars when multiple techs are selected", () => {
    const node = render(
      <AvatarStrip
        techs={TECHS}
        selectedTechIds={[11, 33]}
        onToggleTech={() => undefined}
      />,
    );
    expect(opacityFor(node.getByLabelText(/Alex/))).toBe(1);
    expect(opacityFor(node.getByLabelText(/Bea/))).toBe(0.4);
    expect(opacityFor(node.getByLabelText(/Cam/))).toBe(1);
  });
});

describe("AvatarStrip — color tinting", () => {
  it("invokes the injected colorForTechOverride for each chip", () => {
    const colorForTechOverride = jest.fn(
      (id: number) => `#${id.toString().padStart(6, "0")}`,
    );
    render(
      <AvatarStrip
        techs={TECHS}
        selectedTechIds={[]}
        onToggleTech={() => undefined}
        colorForTechOverride={colorForTechOverride}
      />,
    );
    expect(colorForTechOverride).toHaveBeenCalledWith(11);
    expect(colorForTechOverride).toHaveBeenCalledWith(22);
    expect(colorForTechOverride).toHaveBeenCalledWith(33);
  });
});
