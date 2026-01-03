"use client";

import { useMemo, useState } from "react";

type Option = { id: string; label: string };

type Props = {
  name: string;
  options: Option[];
  selected: string[];
  compactColumns?: number;
};

export function MultiCheck({ name, options, selected, compactColumns = 2 }: Props) {
  const initial = useMemo(() => new Set(selected), [selected]);
  const [checked, setChecked] = useState<Set<string>>(initial);

  const allSelected = checked.size === options.length;
  const toggleAll = (on: boolean) => {
    setChecked(new Set(on ? options.map((o) => o.id) : []));
  };

  const toggleOne = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "#0f172a" }}>
        <input type="checkbox" checked={allSelected} onChange={(e) => toggleAll(e.target.checked)} />
        Select all
      </label>
      <div
        style={{
          display: "grid",
          gap: 6,
          gridTemplateColumns: `repeat(auto-fit, minmax(${Math.max(120, 180 / compactColumns)}px, 1fr))`,
        }}
      >
        {options.map((opt) => (
          <label
            key={opt.id}
            style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13, color: "#0f172a" }}
          >
            <input
              type="checkbox"
              name={name}
              value={opt.id}
              checked={checked.has(opt.id)}
              onChange={() => toggleOne(opt.id)}
            />
            {opt.label}
          </label>
        ))}
      </div>
    </div>
  );
}
