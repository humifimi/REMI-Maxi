/**
 * Phase 2 Chunk 2.3 — tests for the Order Manager `<OrderCarfaxBadge />`.
 *
 * Pure-presentation component: no I/O, no hooks. Each test exercises
 * one row of the mapping table documented in the component's header
 * comment.
 */

import { render } from "@testing-library/react-native";

import { OrderCarfaxBadge } from "../order-carfax-badge";
import { AppointmentCarfaxStatus } from "@technician/types/enums";

describe("<OrderCarfaxBadge />", () => {
  it("renders nothing for not_submitted (deliberate silence)", () => {
    const { toJSON } = render(
      <OrderCarfaxBadge
        status={AppointmentCarfaxStatus.NOT_SUBMITTED}
        attemptCount={0}
        lastError={null}
      />,
    );
    expect(toJSON()).toBeNull();
  });

  it("renders green Reported for status=reported", () => {
    const { getByText, queryByText } = render(
      <OrderCarfaxBadge
        status={AppointmentCarfaxStatus.REPORTED}
        attemptCount={1}
        lastError={null}
      />,
    );
    expect(getByText("CARFAX: Reported")).toBeTruthy();
    expect(queryByText(/transient|exhausted|configured/i)).toBeNull();
  });

  it("renders yellow Pending for status=pending", () => {
    const { getByText } = render(
      <OrderCarfaxBadge
        status={AppointmentCarfaxStatus.PENDING}
        attemptCount={0}
        lastError={null}
      />,
    );
    expect(getByText("CARFAX: Pending")).toBeTruthy();
  });

  it("renders Failed (transient) + lastError when attempts < max", () => {
    const { getByText } = render(
      <OrderCarfaxBadge
        status={AppointmentCarfaxStatus.FAILED}
        attemptCount={2}
        lastError="seed: transient SFTP timeout"
        maxAttempts={5}
      />,
    );
    expect(getByText("CARFAX: Failed")).toBeTruthy();
    expect(getByText("seed: transient SFTP timeout")).toBeTruthy();
  });

  it("renders Retry Exhausted + lastError when attempts >= max", () => {
    const { getByText, queryByText } = render(
      <OrderCarfaxBadge
        status={AppointmentCarfaxStatus.FAILED}
        attemptCount={5}
        lastError="franchise.carfax_location_id is not configured"
        maxAttempts={5}
      />,
    );
    expect(getByText("CARFAX: Retry Exhausted")).toBeTruthy();
    expect(
      getByText("franchise.carfax_location_id is not configured"),
    ).toBeTruthy();
    expect(queryByText("CARFAX: Failed")).toBeNull();
  });

  it("renders grey Historical for status=imported_historical", () => {
    const { getByText } = render(
      <OrderCarfaxBadge
        status={AppointmentCarfaxStatus.IMPORTED_HISTORICAL}
        attemptCount={0}
        lastError={null}
      />,
    );
    expect(getByText("CARFAX: Historical")).toBeTruthy();
  });

  it("does not surface lastError on non-failed states", () => {
    const { queryByText } = render(
      <OrderCarfaxBadge
        status={AppointmentCarfaxStatus.REPORTED}
        attemptCount={1}
        lastError="this should not display"
      />,
    );
    expect(queryByText("this should not display")).toBeNull();
  });
});
