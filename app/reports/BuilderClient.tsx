"use client";

import { useState } from "react";
import { Chart } from "@/components/Chart";
import type { EChartsOption } from "echarts";

const MODULE_TYPES = ["kpi", "timeseries", "breakdown", "matrix", "table"] as const;
type ModuleType = (typeof MODULE_TYPES)[number];

type ModuleConfig = {
  id: string;
  type: ModuleType;
  title?: string;
  summary?: string;
};

type BuilderState = {
  name: string;
  description: string;
  modules: ModuleConfig[];
};

function uid() {
  return `m_${Math.random().toString(16).slice(2)}`;
}

export function BuilderClient({ initial }: { initial?: BuilderState }) {
  const [state, setState] = useState<BuilderState>(
    initial || { name: "", description: "", modules: [] }
  );
  const [drill, setDrill] = useState<string | null>(null);

  const addModule = (type: ModuleType) => {
    setState((s) => ({
      ...s,
      modules: s.modules.concat({ id: uid(), type, title: `${type} module`, summary: "" }),
    }));
  };

  const removeModule = (id: string) => {
    setState((s) => ({ ...s, modules: s.modules.filter((m) => m.id !== id) }));
  };

  const save = async () => {
    await fetch("/api/report-presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: state.name || "Untitled", description: state.description, configJson: state }),
    });
  };

  return (
    <div className="surface" style={{ padding: 16, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          placeholder="Report name"
          value={state.name}
          onChange={(e) => setState({ ...state, name: e.target.value })}
          style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb", minWidth: 200 }}
        />
        <input
          placeholder="Description"
          value={state.description}
          onChange={(e) => setState({ ...state, description: e.target.value })}
          style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb", flex: 1 }}
        />
        <button className="btn primary" type="button" onClick={save}>
          Save
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {MODULE_TYPES.map((t) => (
          <button key={t} className="btn" type="button" onClick={() => addModule(t)}>
            + {t}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {state.modules.map((m) => (
          <div key={m.id} className="surface" style={{ padding: 12, borderRadius: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <input
                  value={m.title || ""}
                  onChange={(e) =>
                    setState((s) => ({
                      ...s,
                      modules: s.modules.map((x) => (x.id === m.id ? { ...x, title: e.target.value } : x)),
                    }))
                  }
                  style={{ fontWeight: 800, border: "none", outline: "none", background: "transparent" }}
                />
                <div style={{ color: "#6b7280", fontSize: 12 }}>{m.summary || `Type: ${m.type}`}</div>
              </div>
              <button className="btn" type="button" onClick={() => removeModule(m.id)}>
                Remove
              </button>
            </div>
            <ModulePreview module={m} drill={drill} setDrill={setDrill} />
          </div>
        ))}
        {state.modules.length === 0 && <div style={{ color: "#6b7280" }}>No modules yet. Add one above.</div>}
      </div>
    </div>
  );
}

function ModulePreview({ module, drill, setDrill }: { module: ModuleConfig; drill: string | null; setDrill: (v: string | null) => void }) {
  if (module.type === "kpi") {
    return <div style={{ color: "#111" }}>KPI tiles placeholder</div>;
  }
  if (module.type === "matrix") {
    return <div style={{ color: "#111" }}>Products x Months matrix placeholder</div>;
  }
  if (module.type === "table") {
    return (
      <div>
        <div style={{ fontWeight: 700 }}>Detail table</div>
        <div style={{ color: "#6b7280", fontSize: 12 }}>
          Drill filter: {drill || "none"} <button className="btn" type="button" onClick={() => setDrill(null)}>Clear</button>
        </div>
      </div>
    );
  }
  // timeseries or breakdown
  const option: EChartsOption = {
    tooltip: { trigger: "axis" },
    legend: {},
    xAxis: { type: "category", data: ["Jan", "Feb", "Mar"] },
    yAxis: { type: "value" },
    series: [{ type: module.type === "breakdown" ? "bar" : "line", data: [10, 20, 15], name: "Sample" }],
  };
  return <Chart option={option} height={260} onClick={(p) => setDrill(p.name || null)} />;
}
