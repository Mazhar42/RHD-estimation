import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "../../../components/ui/Toast";
import EditItemGroupModal from "./EditItemGroupModal";
import { groupToForm } from "../itemMasterUtils";

vi.mock("../../../api/axios", () => ({
  apiClient: { put: vi.fn(() => Promise.resolve({})), post: vi.fn(() => Promise.resolve({})) },
}));
import { apiClient } from "../../../api/axios";

const regions = ["Dhaka Zone", "Sylhet Zone"];
const groupItems = [
  {
    item_id: 11,
    division_id: 7,
    item_code: "E-1",
    item_description: "Excavation",
    unit: "cum",
    organization: "RHD",
    region: "Dhaka Zone",
    rate: 100,
    rate_year: 2024,
  },
];

function renderModal(props) {
  const onSaved = vi.fn();
  render(
    <ToastProvider>
      <EditItemGroupModal
        open
        onClose={() => {}}
        initialForm={groupToForm(groupItems, regions)}
        groupItems={groupItems}
        divisions={[{ division_id: 7, name: "Earthwork" }]}
        units={["cum"]}
        regionNames={regions}
        onSaved={onSaved}
        {...props}
      />
    </ToastProvider>,
  );
  return { onSaved };
}

describe("EditItemGroupModal", () => {
  beforeEach(() => {
    apiClient.put.mockClear();
    apiClient.post.mockClear();
  });

  it("updates existing rows and creates new regions in the group's rate year", async () => {
    const user = userEvent.setup();
    const { onSaved } = renderModal({ isSpecial: false });
    const inputs = screen.getAllByPlaceholderText("Rate");
    await user.clear(inputs[0]);
    await user.type(inputs[0], "110");
    await user.type(inputs[1], "130");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(apiClient.put).toHaveBeenCalledWith(
      "/items/11",
      expect.objectContaining({ rate: 110, region: "Dhaka Zone" }),
    );
    expect(apiClient.post).toHaveBeenCalledWith(
      "/items",
      expect.objectContaining({ rate: 130, region: "Sylhet Zone", rate_year: 2024 }),
    );
    expect(onSaved).toHaveBeenCalled();
  });

  it("never creates plain items when editing a special item", async () => {
    const user = userEvent.setup();
    renderModal({ isSpecial: true });
    const sylhet = screen.getByPlaceholderText("—");
    expect(sylhet).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(apiClient.put).toHaveBeenCalledTimes(1);
    expect(apiClient.post).not.toHaveBeenCalled();
  });
});
