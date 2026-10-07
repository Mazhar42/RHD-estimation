import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ConfirmDeleteLinesModal from "./ConfirmDeleteLinesModal";

const lines = [
  { line_id: 1, item: { item_code: "ITEM.01", item_description: "First item" } },
  { line_id: 2, item: { item_code: "ITEM.02", item_description: "Second item" } },
];

describe("ConfirmDeleteLinesModal", () => {
  it("names the specific line when exactly one is selected", () => {
    render(
      <ConfirmDeleteLinesModal
        selectedIds={[1]}
        lines={lines}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText(/ITEM.01/)).toBeInTheDocument();
    expect(screen.getByText("Delete Line")).toBeInTheDocument();
  });

  it("shows a count instead of a name when multiple lines are selected", () => {
    render(
      <ConfirmDeleteLinesModal
        selectedIds={[1, 2]}
        lines={lines}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText(/2 selected lines/)).toBeInTheDocument();
    expect(screen.getByText("Delete Lines")).toBeInTheDocument();
  });

  it("calls onConfirm when the delete button is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDeleteLinesModal
        selectedIds={[1]}
        lines={lines}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByText("Delete Line"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on Cancel, and on Escape", () => {
    const onClose = vi.fn();
    render(
      <ConfirmDeleteLinesModal
        selectedIds={[1]}
        lines={lines}
        onClose={onClose}
        onConfirm={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("confirms on Enter", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDeleteLinesModal
        selectedIds={[1]}
        lines={lines}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
