import React, { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Modal from "./Modal";

function TwoFieldModal() {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  return (
    <Modal open onClose={() => {}} title="Two fields">
      <input aria-label="first" value={a} onChange={(e) => setA(e.target.value)} />
      <input aria-label="second" value={b} onChange={(e) => setB(e.target.value)} />
    </Modal>
  );
}

describe("Modal", () => {
  it("keeps focus in the field being typed into when the parent re-renders", async () => {
    const user = userEvent.setup();
    render(<TwoFieldModal />);
    await user.click(screen.getByLabelText("second"));
    await user.keyboard("abc");
    expect(screen.getByLabelText("second")).toHaveValue("abc");
    expect(screen.getByLabelText("second")).toHaveFocus();
  });

  it("closes only the topmost modal on Escape", async () => {
    const user = userEvent.setup();
    const outerClose = vi.fn();
    const innerClose = vi.fn();
    render(
      <>
        <Modal open onClose={outerClose} title="Outer">
          <input aria-label="outer" />
        </Modal>
        <Modal open onClose={innerClose} title="Inner">
          <input aria-label="inner" />
        </Modal>
      </>,
    );
    await user.keyboard("{Escape}");
    expect(innerClose).toHaveBeenCalledTimes(1);
    expect(outerClose).not.toHaveBeenCalled();
  });

  it("submits on Enter when given onSubmit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <Modal open onClose={() => {}} title="Form" onSubmit={onSubmit}>
        <input aria-label="name" />
      </Modal>,
    );
    await user.type(screen.getByLabelText("name"), "x{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("ignores Escape while closeDisabled", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Busy" closeDisabled>
        <input aria-label="x" />
      </Modal>,
    );
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });
});
