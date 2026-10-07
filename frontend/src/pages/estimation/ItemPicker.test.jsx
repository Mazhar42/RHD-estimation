import React, { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ItemPicker, { searchItems } from "./ItemPicker";

const items = [
  { item_id: 1, item_code: "03.01.01", item_description: "Earth filling in embankment", unit: "cum", rate: 250 },
  { item_id: 2, item_code: "05.02.10", item_description: "Brick soling for road base", unit: "sqm", rate: 400 },
  { item_id: 3, item_code: "12.03.01", item_description: "Earthwork excavation", unit: "cum", rate: 180, rate_year: 2025 },
];

describe("searchItems", () => {
  it("requires every word, in any order, across code and description", () => {
    expect(searchItems(items, "earth excavation").map((i) => i.item_id)).toEqual([3]);
    expect(searchItems(items, "road brick").map((i) => i.item_id)).toEqual([2]);
    expect(searchItems(items, "nothing")).toEqual([]);
  });

  it("ranks code-prefix matches first", () => {
    expect(searchItems(items, "03").map((i) => i.item_id)).toEqual([1, 3]);
  });

  it("returns everything for an empty query", () => {
    expect(searchItems(items, "  ")).toHaveLength(3);
  });
});

function Harness({ onChange }) {
  const [value, setValue] = useState("");
  return (
    <ItemPicker
      items={items}
      value={value}
      onChange={(it) => {
        setValue(String(it.item_id));
        onChange(it);
      }}
    />
  );
}

describe("ItemPicker", () => {
  it("filters as you type and picks with the keyboard", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByRole("combobox");
    await user.type(input, "earth");
    expect(screen.getAllByRole("option")).toHaveLength(2);
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ item_id: 3 }));
    expect(input).toHaveValue("12.03.01 — Earthwork excavation (2025)");
  });

  it("offers Load more when the catalogue has more pages", async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();
    render(<ItemPicker items={items} value="" onChange={() => {}} hasMore onLoadMore={onLoadMore} />);
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(onLoadMore).toHaveBeenCalled();
  });
});
