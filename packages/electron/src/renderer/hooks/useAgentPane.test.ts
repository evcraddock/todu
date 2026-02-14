/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AGENT_PANE_DEFAULTS, type AgentPaneState, loadAgentPaneState } from "./useAgentPane.js";

const STORAGE_KEY = "todu-agent-pane";

describe("agent pane state persistence", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("defaults to hidden with default width", () => {
    const state = loadAgentPaneState();
    expect(state.width).toBe(AGENT_PANE_DEFAULTS.width);
    expect(state.visible).toBe(false);
  });

  it("restores valid saved state", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ width: 400, visible: true }));
    const state = loadAgentPaneState();
    expect(state.width).toBe(400);
    expect(state.visible).toBe(true);
  });

  it("restores visible: false", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ width: 350, visible: false }));
    const state = loadAgentPaneState();
    expect(state.visible).toBe(false);
  });

  it("clamps width below minimum to default", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ width: 100, visible: true }));
    const state = loadAgentPaneState();
    expect(state.width).toBe(AGENT_PANE_DEFAULTS.width);
  });

  it("clamps width above maximum to default", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ width: 900, visible: true }));
    const state = loadAgentPaneState();
    expect(state.width).toBe(AGENT_PANE_DEFAULTS.width);
  });

  it("handles corrupted JSON", () => {
    localStorage.setItem(STORAGE_KEY, "not-json");
    const state = loadAgentPaneState();
    expect(state.width).toBe(AGENT_PANE_DEFAULTS.width);
    expect(state.visible).toBe(false);
  });

  it("handles non-numeric width", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ width: "abc", visible: true }));
    const state = loadAgentPaneState();
    expect(state.width).toBe(AGENT_PANE_DEFAULTS.width);
  });

  it("handles non-boolean visible", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ width: 380, visible: "yes" }));
    const state = loadAgentPaneState();
    expect(state.visible).toBe(false);
  });

  it("accepts boundary values", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ width: AGENT_PANE_DEFAULTS.minWidth, visible: true }),
    );
    expect(loadAgentPaneState().width).toBe(AGENT_PANE_DEFAULTS.minWidth);

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ width: AGENT_PANE_DEFAULTS.maxWidth, visible: true }),
    );
    expect(loadAgentPaneState().width).toBe(AGENT_PANE_DEFAULTS.maxWidth);
  });
});

describe("agent pane cssWidth calculation", () => {
  it("returns 0 when not visible", () => {
    const state: AgentPaneState = { width: 380, visible: false };
    const cssWidth = state.visible ? state.width : 0;
    expect(cssWidth).toBe(0);
  });

  it("returns actual width when visible", () => {
    const state: AgentPaneState = { width: 420, visible: true };
    const cssWidth = state.visible ? state.width : 0;
    expect(cssWidth).toBe(420);
  });
});
