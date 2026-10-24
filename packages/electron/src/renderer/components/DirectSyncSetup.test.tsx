/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DeviceId, EnrollmentRequestId } from "@todu/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DirectSyncRequests, DirectSyncSetup } from "./DirectSyncSetup.js";

describe("direct connection flow", () => {
  beforeEach(() => {
    Object.defineProperty(window, "todu", {
      configurable: true,
      value: {
        sync: {
          enrollmentStatus: vi.fn().mockResolvedValue({ stage: "idle" }),
          enroll: vi.fn().mockResolvedValue({ stage: "pending", endpoint: "http://peer:24377" }),
          enrollmentCancel: vi.fn().mockResolvedValue({ stage: "cancelled" }),
          enrollmentRequests: vi.fn().mockResolvedValue([]),
          enrollmentApprove: vi.fn().mockResolvedValue({}),
          enrollmentDeny: vi.fn().mockResolvedValue({}),
        },
      },
    });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("guides listener setup without enabling it automatically", async () => {
    const setup = vi.fn();
    render(<DirectSyncSetup listenerReady={false} onSetup={setup} onConnected={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Other computer’s direct address"), {
      target: { value: "http://peer:24377" },
    });
    expect(
      (screen.getByRole("button", { name: "Request connection" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Set up Direct Sync" }));
    expect(setup).toHaveBeenCalledOnce();
    expect(window.todu.sync.enroll).not.toHaveBeenCalled();
  });

  it("requests enrollment, shows approval progress, and cancels without changing datasets", async () => {
    render(<DirectSyncSetup listenerReady onSetup={vi.fn()} onConnected={vi.fn()} />);
    await screen.findByText("Ready to request a connection.");
    fireEvent.change(screen.getByLabelText("Other computer’s direct address"), {
      target: { value: "http://peer:24377" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Request connection" }));
    expect(await screen.findByText(/Waiting for approval/)).toBeDefined();
    expect(window.todu.sync.enroll).toHaveBeenCalledWith("http://peer:24377");
    expect(
      (screen.getByRole("button", { name: "Request connection" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel request" }));
    expect(await screen.findByText("The connection request was cancelled.")).toBeDefined();
    expect(window.todu.sync.enrollmentCancel).toHaveBeenCalledOnce();
  });

  it("surfaces daemon dataset refusals without claiming success", async () => {
    vi.mocked(window.todu.sync.enroll).mockRejectedValue(
      new Error("Different initialized dataset; enrollment cannot replace or merge it"),
    );
    render(<DirectSyncSetup listenerReady onSetup={vi.fn()} onConnected={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Other computer’s direct address"), {
      target: { value: "http://peer:24377" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Request connection" }));
    expect((await screen.findByRole("alert")).textContent).toContain("cannot replace or merge");
  });

  it("polls approval progress and refreshes the dataset after activation", async () => {
    vi.useFakeTimers();
    const connected = vi.fn();
    vi.mocked(window.todu.sync.enrollmentStatus)
      .mockResolvedValueOnce({ stage: "pending" })
      .mockResolvedValue({ stage: "active", catalogId: "shared-catalog" });
    render(<DirectSyncSetup listenerReady onSetup={vi.fn()} onConnected={connected} />);
    await act(async () => {});
    expect(screen.getByText(/Waiting for approval/)).toBeDefined();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByText(/Approved and connected/)).toBeDefined();
    expect(connected).toHaveBeenCalledOnce();
    expect(screen.getByText("shared-catalog")).toBeDefined();
  });

  it.each(["Approve", "Deny"])(
    "lets the sharing computer %s an incoming request",
    async (action) => {
      vi.mocked(window.todu.sync.enrollmentRequests)
        .mockResolvedValueOnce([
          {
            requestId: "request-id" as EnrollmentRequestId,
            state: "pending",
            device: {
              id: "peer-id" as DeviceId,
              name: "Work laptop",
              endpoint: "http://peer:24377",
            },
            catalogId: "catalog",
            createdAt: "2026-10-24T17:00:00Z",
            expiresAt: "2026-10-24T17:10:00Z",
          },
        ])
        .mockResolvedValue([]);
      render(<DirectSyncRequests />);
      expect(await screen.findByText("Work laptop")).toBeDefined();
      fireEvent.click(screen.getByRole("button", { name: action }));
      const method =
        action === "Approve" ? window.todu.sync.enrollmentApprove : window.todu.sync.enrollmentDeny;
      await waitFor(() => expect(method).toHaveBeenCalledWith("request-id"));
      expect(await screen.findByText("No pending connection requests.")).toBeDefined();
    },
  );
});
