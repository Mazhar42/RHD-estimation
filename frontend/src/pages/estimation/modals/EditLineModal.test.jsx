import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import EditLineModal from "./EditLineModal";

function makeLine(overrides = {}) {
  return {
    line_id: 1,
    parent_line_id: null,
    item_id: 42,
    element_id: null,
    rate: 100,
    sub_description: "",
    no_of_units: 1,
    no_of_units_expr: null,
    length: 2,
    length_expr: null,
    width: 3,
    width_expr: null,
    thickness: null,
    thickness_expr: null,
    quantity: null,
    item: { item_id: 42, item_code: "ITEM.01", item_description: "Test item", unit: "sqm" },
    ...overrides,
  };
}

describe("EditLineModal", () => {
  it("pre-fills the form from the line's current dimensions", () => {
    render(<EditLineModal line={makeLine()} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByPlaceholderText("Length")).toHaveValue("2");
    expect(screen.getByPlaceholderText("Width")).toHaveValue("3");
    expect(screen.getByText(/ITEM.01/)).toBeInTheDocument();
  });

  it("prefers a saved expression over the plain numeric value", () => {
    render(
      <EditLineModal
        line={makeLine({ length: 6, length_expr: "2*3" })}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByPlaceholderText("Length")).toHaveValue("2*3");
  });

  it("submits a payload built from the current field values", () => {
    const onSave = vi.fn();
    render(<EditLineModal line={makeLine()} onClose={vi.fn()} onSave={onSave} />);

    fireEvent.change(screen.getByPlaceholderText("Width"), { target: { value: "5" } });
    fireEvent.click(screen.getByText("Save Changes"));

    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0][0];
    expect(payload.item_id).toBe(42); // item is never editable here
    expect(payload.width).toBe(5);
    expect(payload.length).toBe(2);
  });

  it("evaluates an arithmetic expression entered into a dimension field", () => {
    const onSave = vi.fn();
    render(<EditLineModal line={makeLine()} onClose={vi.fn()} onSave={onSave} />);

    fireEvent.change(screen.getByPlaceholderText("Length"), { target: { value: "2+3" } });
    fireEvent.click(screen.getByText("Save Changes"));

    const payload = onSave.mock.calls[0][0];
    expect(payload.length).toBe(5);
    expect(payload.length_expr).toBe("2+3");
  });

  it("blocks submission and shows an error for an invalid dimension expression, without calling onSave", () => {
    const onSave = vi.fn();
    render(<EditLineModal line={makeLine()} onClose={vi.fn()} onSave={onSave} />);

    fireEvent.change(screen.getByPlaceholderText("Length"), { target: { value: "abc" } });
    fireEvent.click(screen.getByText("Save Changes"));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Invalid expression")).toBeInTheDocument();
  });

  it("includes element_id in the payload for a root line but not for a child line", () => {
    const elements = [{ element_id: 7, code: "P1", sort_order: 10 }];

    const onSaveRoot = vi.fn();
    const { unmount } = render(
      <EditLineModal
        line={makeLine({ element_id: 7 })}
        elements={elements}
        onClose={vi.fn()}
        onSave={onSaveRoot}
      />,
    );
    fireEvent.click(screen.getByText("Save Changes"));
    expect(onSaveRoot.mock.calls[0][0]).toHaveProperty("element_id", 7);
    unmount();

    const onSaveChild = vi.fn();
    render(
      <EditLineModal
        line={makeLine({ parent_line_id: 99, element_id: 7 })}
        elements={elements}
        onClose={vi.fn()}
        onSave={onSaveChild}
      />,
    );
    fireEvent.click(screen.getByText("Save Changes"));
    expect(onSaveChild.mock.calls[0][0]).not.toHaveProperty("element_id");
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(<EditLineModal line={makeLine()} onClose={onClose} onSave={vi.fn()} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<EditLineModal line={makeLine()} onClose={onClose} onSave={vi.fn()} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
