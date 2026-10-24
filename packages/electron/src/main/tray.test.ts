import type { Todu } from "@todu/engine";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  createFromPath: vi.fn(),
  setTemplateImage: vi.fn(),
  resize: vi.fn(),
  constructTray: vi.fn(),
  resizedImage: {},
}));

vi.mock("electron", () => ({
  app: { quit: vi.fn() },
  nativeImage: { createFromPath: mock.createFromPath },
  Menu: { buildFromTemplate: vi.fn(() => ({})) },
  Tray: class {
    constructor(image: unknown) {
      mock.constructTray(image);
    }
    on = vi.fn();
    setToolTip = vi.fn();
    setContextMenu = vi.fn();
    destroy = vi.fn();
  },
}));

import { destroyTray, setupTray } from "./tray.js";

const image = { setTemplateImage: mock.setTemplateImage, resize: mock.resize };
const todu = {
  task: { list: vi.fn().mockResolvedValue({ ok: true, value: [] }) },
  habit: { list: vi.fn().mockResolvedValue({ ok: true, value: [] }) },
} as unknown as Todu;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mock.createFromPath.mockReturnValue(image);
  mock.resize.mockReturnValue(mock.resizedImage);
});
afterEach(() => {
  destroyTray();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("uses the background-free macOS template without discarding Retina representations", () => {
  vi.stubGlobal("process", { ...process, platform: "darwin" });
  setupTray(todu, () => null, vi.fn());
  expect(mock.createFromPath).toHaveBeenCalledWith(
    expect.stringMatching(/resources\/trayTemplate\.png$/),
  );
  expect(mock.setTemplateImage).toHaveBeenCalledWith(true);
  expect(mock.resize).not.toHaveBeenCalled();
  expect(mock.constructTray).toHaveBeenCalledWith(image);
});

it.each(["linux", "win32"])("keeps the colored app icon on %s", async (platform) => {
  vi.stubGlobal("process", { ...process, platform });
  setupTray(todu, () => null, vi.fn());
  await Promise.resolve();
  expect(mock.createFromPath).toHaveBeenCalledWith(
    expect.stringMatching(/resources\/app-icon\.png$/),
  );
  expect(mock.setTemplateImage).not.toHaveBeenCalled();
  expect(mock.resize).toHaveBeenCalledWith({ width: 24, height: 24 });
  expect(mock.constructTray).toHaveBeenCalledWith(mock.resizedImage);
});
