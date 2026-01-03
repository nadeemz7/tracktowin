"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
// src/ui/ConditionEditor.tsx
import React from "react";
import { Condition } from "../engine/types";

export type FieldOption = {
  label: string;
  value: string; // e.g. "txn.line"
  kind: "string" | "number" | "date" | "boolean" | "any";
};

const OPS_BY_KIND: Record<FieldOption["kind"], Array<{ op: any; label: string }>> = {
  string: [
    { op: "eq", label: "=" },
    { op: "neq", label: "≠" },
    { op: "contains", label: "contains" },
    { op: "startsWith", label: "starts with" },
    { op: "endsWith", label: "ends with" },
    { op: "in", label: "in (list)" },
    { op: "exists", label: "exists" },
  ],
  number: [
    { op: "eq", label: "=" },
    { op: "neq", label: "≠" },
    { op: "gt", label: ">" },
    { op: "gte", label: "≥" },
    { op: "lt", label: "<" },
    { op: "lte", label: "≤" },
    { op: "in", label: "in (list)" },
    { op: "exists", label: "exists" },
  ],
  date: [
    { op: "betweenDates", label: "between dates" },
    { op: "exists", label: "exists" },
  ],
  boolean: [
    { op: "eq", label: "=" },
    { op: "neq", label: "≠" },
    { op: "exists", label: "exists" },
  ],
  any: [
    { op: "eq", label: "=" },
    { op: "neq", label: "≠" },
    { op: "gt", label: ">" },
    { op: "gte", label: "≥" },
    { op: "lt", label: "<" },
    { op: "lte", label: "≤" },
    { op: "contains", label: "contains" },
    { op: "startsWith", label: "starts with" },
    { op: "endsWith", label: "ends with" },
    { op: "in", label: "in (list)" },
    { op: "betweenDates", label: "between dates" },
    { op: "exists", label: "exists" },
  ],
};

function defaultLeaf(field = "txn.line"): Condition {
  return { op: "eq", field, value: "" };
}

function isGroup(c: Condition): c is { op: "and" | "or"; conditions: Condition[] } {
  return c.op === "and" || c.op === "or";
}

type Props = {
  value: Condition;
  onChange: (next: Condition) => void;
  fields: FieldOption[];
  allowDelete?: boolean;
  onDelete?: () => void;
  title?: string;
  suggestions?: Record<string, string[]>;
};

export function ConditionEditor({
  value,
  onChange,
  fields,
  allowDelete,
  onDelete,
  title,
  suggestions,
}: Props) {
  return (
    <div className="condRoot">
      {title && <div className="condTitle">{title}</div>}

      {isGroup(value) ? (
        <ConditionGroup
          group={value}
          onChange={onChange}
          fields={fields}
          allowDelete={allowDelete}
          onDelete={onDelete}
          suggestions={suggestions}
        />
      ) : (
        <ConditionLeaf
          leaf={value}
          onChange={onChange}
          fields={fields}
          allowDelete={allowDelete}
          onDelete={onDelete}
          suggestions={suggestions}
        />
      )}
    </div>
  );
}

function ConditionGroup({
  group,
  onChange,
  fields,
  allowDelete,
  onDelete,
  suggestions,
}: {
  group: { op: "and" | "or"; conditions: Condition[] };
  onChange: (next: Condition) => void;
  fields: FieldOption[];
  allowDelete?: boolean;
  onDelete?: () => void;
  suggestions?: Record<string, string[]>;
}) {
  const setOp = (op: "and" | "or") => onChange({ ...group, op });
  const setChild = (idx: number, child: Condition) => {
    const next = group.conditions.slice();
    next[idx] = child;
    onChange({ ...group, conditions: next });
  };
  const removeChild = (idx: number) => {
    const next = group.conditions.filter((_, i) => i !== idx);
    // If group empties, replace with a leaf
    if (next.length === 0) onChange(defaultLeaf(fields[0]?.value || "txn.line"));
    else onChange({ ...group, conditions: next });
  };
  const addLeaf = () => {
    const next = group.conditions.concat([defaultLeaf(fields[0]?.value || "txn.line")]);
    onChange({ ...group, conditions: next });
  };
  const addGroup = () => {
    const next = group.conditions.concat([{ op: "and", conditions: [defaultLeaf(fields[0]?.value || "txn.line")] }]);
    onChange({ ...group, conditions: next });
  };

  return (
    <div className="condGroup">
      <div className="condGroupHeader">
        <div className="row gap8">
          <span className="pill">Group</span>
          <select
            className="select"
            value={group.op}
            onChange={(e) => setOp(e.target.value as any)}
            title="AND/OR"
          >
            <option value="and">AND (all)</option>
            <option value="or">OR (any)</option>
          </select>
        </div>

        <div className="row gap8">
          <button className="btn" onClick={addLeaf} type="button">
            + Condition
          </button>
          <button className="btn" onClick={addGroup} type="button">
            + Group
          </button>
          {allowDelete && onDelete && (
            <button className="btn danger" onClick={onDelete} type="button">
              Delete
            </button>
          )}
        </div>
      </div>

      <div className="condGroupBody">
        {group.conditions.map((c, idx) => (
          <ConditionEditor
            key={idx}
            value={c}
            onChange={(next) => setChild(idx, next)}
            fields={fields}
            allowDelete={true}
            onDelete={() => removeChild(idx)}
            suggestions={suggestions}
          />
        ))}
      </div>
    </div>
  );
}

function ConditionLeaf({
  leaf,
  onChange,
  fields,
  allowDelete,
  onDelete,
  suggestions = {},
}: {
  leaf: Exclude<Condition, { op: "and" | "or"; conditions: Condition[] }>;
  onChange: (next: Condition) => void;
  fields: FieldOption[];
  allowDelete?: boolean;
  onDelete?: () => void;
  suggestions?: Record<string, string[]>;
}) {
  const fieldOpt = fields.find((f) => f.value === (leaf as any).field) || fields[0];
  const kind = fieldOpt?.kind || "any";
  const ops = OPS_BY_KIND[kind];

  const op = (leaf as any).op;

  const setField = (field: string) => {
    // Reset leaf to a sensible default based on field kind
    const opt = fields.find((f) => f.value === field);
    const nextKind = opt?.kind || "any";
    if (nextKind === "date") {
      onChange({ op: "betweenDates", field, startISO: "2025-01-01", endISO: "2025-12-31" });
      return;
    }
    onChange({ op: "eq", field, value: "" });
  };

  const setOp = (nextOp: any) => {
    if (nextOp === "betweenDates") {
      onChange({ op: "betweenDates", field: (leaf as any).field, startISO: "2025-01-01", endISO: "2025-12-31" });
      return;
    }
    if (nextOp === "exists") {
      onChange({ op: "exists", field: (leaf as any).field, value: true });
      return;
    }
    onChange({ op: nextOp, field: (leaf as any).field, value: (leaf as any).value ?? "" });
  };

  const setValue = (v: any) => {
    if ((leaf as any).op === "exists") {
      onChange({ ...(leaf as any), value: Boolean(v) });
      return;
    }
    onChange({ ...(leaf as any), value: v });
  };

  const fieldKey = (leaf as any).field as string;
  const suggestionList = suggestions?.[fieldKey] || [];
  const listId = suggestionList.length ? `cond-suggest-${fieldKey.replace(/[^a-zA-Z0-9_-]/g, "_")}` : undefined;

  const renderValueInput = () => {
    if ((leaf as any).op === "betweenDates") {
      return (
        <div className="row gap8">
          <input
            className="input"
            type="date"
            value={(leaf as any).startISO}
            onChange={(e) => onChange({ ...(leaf as any), startISO: e.target.value })}
          />
          <span className="muted">to</span>
          <input
            className="input"
            type="date"
            value={(leaf as any).endISO}
            onChange={(e) => onChange({ ...(leaf as any), endISO: e.target.value })}
          />
        </div>
      );
    }

    if ((leaf as any).op === "exists") {
      return (
        <select className="select" value={String((leaf as any).value)} onChange={(e) => setValue(e.target.value === "true")}>
          <option value="true">exists</option>
          <option value="false">does not exist</option>
        </select>
      );
    }

    if ((leaf as any).op === "in") {
      const cur = Array.isArray((leaf as any).value) ? (leaf as any).value.join(", ") : "";
      return (
        <input
          className="input"
          value={cur}
          placeholder="comma-separated values"
          onChange={(e) => {
            const arr = e.target.value
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean);
            setValue(arr);
          }}
        />
      );
    }

    if (kind === "number") {
      return (
        <input
          className="input"
          type="number"
          value={(leaf as any).value ?? ""}
          onChange={(e) => setValue(e.target.value === "" ? "" : Number(e.target.value))}
        />
      );
    }

    if (kind === "boolean") {
      return (
        <select className="select" value={String((leaf as any).value)} onChange={(e) => setValue(e.target.value === "true")}>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      );
    }

    return (
      <>
        <input
          className="input"
          list={listId}
          value={(leaf as any).value ?? ""}
          onChange={(e) => setValue(e.target.value)}
          placeholder={suggestionList.length ? "Type or pick an option" : undefined}
        />
        {listId && (
          <datalist id={listId}>
            {suggestionList.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        )}
      </>
    );
  };

  return (
    <div className="condLeaf">
      <div className="row gap8 wrap">
        <select className="select" value={(leaf as any).field} onChange={(e) => setField(e.target.value)}>
          {fields.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>

        <select className="select" value={op} onChange={(e) => setOp(e.target.value as any)}>
          {ops.map((o) => (
            <option key={o.op} value={o.op}>
              {o.label}
            </option>
          ))}
        </select>

        {renderValueInput()}

        <button
          className="btn"
          type="button"
          onClick={() => onChange({ op: "and", conditions: [leaf] })}
          title="Wrap this condition into an AND group"
        >
          Wrap in AND
        </button>

        <button
          className="btn"
          type="button"
          onClick={() => onChange({ op: "or", conditions: [leaf] })}
          title="Wrap this condition into an OR group"
        >
          Wrap in OR
        </button>

        {allowDelete && onDelete && (
          <button className="btn danger" onClick={onDelete} type="button">
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
