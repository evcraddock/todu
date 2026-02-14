/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Tab, TabBar } from "./TabBar.js";

afterEach(cleanup);

const TABS: Tab[] = [
  { id: "description", label: "Description" },
  { id: "comments", label: "Comments" },
  { id: "tasks", label: "Tasks" },
];

describe("TabBar", () => {
  it("renders all tab labels", () => {
    render(<TabBar tabs={TABS} activeTab="description" onTabChange={() => {}} />);
    expect(screen.getByText("Description")).toBeDefined();
    expect(screen.getByText("Comments")).toBeDefined();
    expect(screen.getByText("Tasks")).toBeDefined();
  });

  it("applies active class to the active tab only", () => {
    render(<TabBar tabs={TABS} activeTab="comments" onTabChange={() => {}} />);
    const desc = screen.getByText("Description");
    const comments = screen.getByText("Comments");
    const tasks = screen.getByText("Tasks");

    expect(comments.className).toContain("tab-bar-item-active");
    expect(desc.className).not.toContain("tab-bar-item-active");
    expect(tasks.className).not.toContain("tab-bar-item-active");
  });

  it("calls onTabChange with correct tab id on click", () => {
    const onChange = vi.fn();
    render(<TabBar tabs={TABS} activeTab="description" onTabChange={onChange} />);

    fireEvent.click(screen.getByText("Comments"));
    expect(onChange).toHaveBeenCalledWith("comments");

    fireEvent.click(screen.getByText("Tasks"));
    expect(onChange).toHaveBeenCalledWith("tasks");

    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("renders no tabs when given empty array", () => {
    const { container } = render(<TabBar tabs={[]} activeTab="" onTabChange={() => {}} />);
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBe(0);
  });
});
