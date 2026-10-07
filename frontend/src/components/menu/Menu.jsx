import React, { useEffect, useMemo, useRef, useState } from "react";

function getMenuPosition(anchorRef, position) {
  if (position) {
    return {
      position: "fixed",
      left: position.x,
      top: position.y,
    };
  }

  if (!anchorRef?.current) {
    return { position: "absolute", left: 0, top: "100%" };
  }

  const rect = anchorRef.current.getBoundingClientRect();
  const estimatedWidth = 240;
  let left = rect.left;
  if (left + estimatedWidth > window.innerWidth) {
    left = Math.max(8, window.innerWidth - estimatedWidth - 8);
  }
  return {
    position: "fixed",
    left,
    top: rect.bottom + 8,
  };
}

export default function Menu({
  open,
  onClose,
  items,
  anchorRef,
  position,
  className = "min-w-[220px]",
}) {
  const containerRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const actionableIndexes = useMemo(
    () =>
      items
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => item?.type !== "separator" && !item?.disabled)
        .map(({ index }) => index),
    [items],
  );

  useEffect(() => {
    if (!open) return undefined;

    setActiveIndex(actionableIndexes[0] ?? 0);

    const handleClickOutside = (event) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
        onClose?.();
      }
    };

    const handleKeyDown = (event) => {
      if (!open) return;
      if (event.key === "Escape" || event.key === "Tab") {
        onClose?.();
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (!actionableIndexes.length) return;
        const currentPosition = actionableIndexes.indexOf(activeIndex);
        const delta = event.key === "ArrowDown" ? 1 : -1;
        const nextPosition =
          (currentPosition + delta + actionableIndexes.length) %
          actionableIndexes.length;
        setActiveIndex(actionableIndexes[nextPosition]);
      }
      if (event.key === "Enter") {
        const activeItem = items[activeIndex];
        if (
          activeItem &&
          !activeItem.disabled &&
          activeItem.type !== "separator"
        ) {
          activeItem.onSelect?.();
          onClose?.();
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose, items, activeIndex, actionableIndexes]);

  if (!open) return null;

  const menuPosition = getMenuPosition(anchorRef, position);

  return (
    <div
      ref={containerRef}
      role="menu"
      className={`${className} z-50 rounded-lg border border-gray-200 bg-white py-2 text-sm text-gray-700 shadow-xl`}
      style={menuPosition}
    >
      {items.map((item, index) => {
        if (item.type === "separator") {
          return (
            <div
              key={`sep-${index}`}
              className="my-1 border-t border-gray-100"
            />
          );
        }

        return (
          <button
            key={`${item.label}-${index}`}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={() => {
              item.onSelect?.();
              onClose?.();
            }}
            className={`block w-full px-4 py-2 text-left ${index === activeIndex ? "bg-gray-50" : ""} ${item.disabled ? "cursor-not-allowed text-gray-400" : "hover:bg-gray-50"}`}
          >
            <div className="font-medium">{item.label}</div>
            {item.description && (
              <div className="text-xs text-gray-500">{item.description}</div>
            )}
          </button>
        );
      })}
    </div>
  );
}
