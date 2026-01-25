"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  Handle,
  Position,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from "reactflow";
import "reactflow/dist/style.css";

type OrgChartClientProps = {
  canManagePeople: boolean;
  ownerName: string;
  people: OrgChartPerson[];
  teams: OrgChartTeam[];
};

type OrgChartPerson = {
  id: string;
  fullName: string;
  roleId?: string | null;
  teamId?: string | null;
  active?: boolean;
};
type OrgChartTeam = { id: string; name: string; roles: { id: string; name: string }[] };
type OrgBoxNodeData = {
  label?: string;
  entityType?: "owner" | "team" | "role" | null;
  entityId?: string | null;
};
type ChartPayload = { nodes: Node[]; edges: Edge[] };
type SaveState = { saving: boolean; error: string | null; success: boolean };

const initialNodes: Node[] = [
  {
    id: "owner",
    type: "orgBox",
    position: { x: 250, y: 40 },
    data: { label: "Owner", entityType: "owner", entityId: null },
  },
];

export default function OrgChartClient({ canManagePeople, ownerName, people, teams }: OrgChartClientProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [snap, setSnap] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>({ saving: false, error: null, success: false });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoverEditNodeId, setHoverEditNodeId] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string>(() => teams[0]?.id ?? "");
  const historyPastRef = useRef<ChartPayload[]>([]);
  const historyFutureRef = useRef<ChartPayload[]>([]);
  const nodesRef = useRef<Node[]>(initialNodes);
  const edgesRef = useRef<Edge[]>([]);
  const hoverEditSelectRef = useRef<HTMLSelectElement | null>(null);
  const addTeamRef = useRef<() => void>(() => {});
  const addChildForNodeRef = useRef<(parentId: string) => void>(() => {});
  const addSiblingForNodeRef = useRef<(nodeId: string) => void>(() => {});
  const deleteNodeByIdRef = useRef<(nodeId: string) => void>(() => {});
  const updateNodeDataByIdRef = useRef<(nodeId: string, nextData: Partial<OrgBoxNodeData>) => void>(() => {});
  const nextIdRef = useRef(1);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const selectedNode = selectedNodeId ? nodes.find((node) => node.id === selectedNodeId) || null : null;
  const selectedEdge = selectedEdgeId ? edges.find((edge) => edge.id === selectedEdgeId) || null : null;
  const teamById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const roleById = useMemo(() => {
    const map = new Map<string, { id: string; name: string; teamName?: string }>();
    teams.forEach((team) => {
      team.roles.forEach((role) => {
        map.set(role.id, { id: role.id, name: role.name, teamName: team.name });
      });
    });
    return map;
  }, [teams]);
  const roleOptions = useMemo(() => {
    const list: Array<{ id: string; label: string }> = [];
    teams.forEach((team) => {
      team.roles.forEach((role) => {
        list.push({ id: role.id, label: `${team.name} / ${role.name}` });
      });
    });
    list.sort((a, b) => a.label.localeCompare(b.label));
    return list;
  }, [teams]);
  const peopleByRoleId = useMemo(() => {
    const map = new Map<string, string[]>();
    people.forEach((person) => {
      if (!person.roleId || person.active === false) return;
      const list = map.get(person.roleId) || [];
      list.push(person.fullName);
      map.set(person.roleId, list);
    });
    map.forEach((list) => list.sort((a, b) => a.localeCompare(b)));
    return map;
  }, [people]);

  useEffect(() => {
    if (!teams.length) {
      if (selectedTeamId) setSelectedTeamId("");
      return;
    }
    if (!selectedTeamId || !teams.some((team) => team.id === selectedTeamId)) {
      setSelectedTeamId(teams[0].id);
    }
  }, [selectedTeamId, teams]);

  useEffect(() => {
    if (!hoverEditNodeId) {
      hoverEditSelectRef.current = null;
      return;
    }
    requestAnimationFrame(() => {
      hoverEditSelectRef.current?.focus();
    });
  }, [hoverEditNodeId]);

  useEffect(() => {
    if (!hoverEditNodeId) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setHoverEditNodeId(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, [hoverEditNodeId]);

  const loadChart = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/org-chart", { credentials: "include" });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const trimmed = text.trim();
        const snippet = trimmed.length > 200 ? `${trimmed.slice(0, 200)}...` : trimmed;
        const message = `Load failed (${res.status}): ${snippet || res.statusText || "Unknown error"}`;
        throw new Error(message);
      }
      const json = await res.json();
      const chart = json?.chart as ChartPayload | null;
      if (chart && Array.isArray(chart.nodes) && Array.isArray(chart.edges)) {
        const normalizedNodes = chart.nodes.map((node) => {
          const rawData =
            node.data && typeof node.data === "object" ? { ...(node.data as Record<string, any>) } : {};
          const isOwner = node.id === "owner";
          const label = typeof rawData.label === "string" ? rawData.label : isOwner ? "Owner" : "New box";
          const entityType = isOwner ? "owner" : (rawData.entityType ?? null);
          const entityId = isOwner ? null : (rawData.entityId ?? null);
          return {
            ...node,
            type: "orgBox",
            data: { ...rawData, label, entityType, entityId },
          };
        });
        if (!isMountedRef.current) return;
        setNodes(normalizedNodes);
        setEdges(chart.edges);
        historyPastRef.current = [];
        historyFutureRef.current = [];
        let maxId = 0;
        normalizedNodes.forEach((node) => {
          const match = typeof node.id === "string" ? node.id.match(/^node-(\d+)$/) : null;
          if (match) {
            const value = Number(match[1]);
            if (Number.isFinite(value) && value > maxId) maxId = value;
          }
        });
        nextIdRef.current = maxId + 1;
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
      }
      if (isMountedRef.current) setDirty(false);
    } catch (err: any) {
      if (isMountedRef.current) setLoadError(err?.message || "Failed to load org chart");
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [setEdges, setNodes]);

  useEffect(() => {
    loadChart();
  }, [loadChart]);

  useEffect(() => {
    nodesRef.current = nodes;
    edgesRef.current = edges;
  }, [nodes, edges]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (selectedNodeId && !nodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId(null);
    }
  }, [nodes, selectedNodeId]);

  useEffect(() => {
    if (selectedEdgeId && !edges.some((edge) => edge.id === selectedEdgeId)) {
      setSelectedEdgeId(null);
    }
  }, [edges, selectedEdgeId]);

  const getNodeById = (id: string) => nodes.find((node) => node.id === id) || null;

  const snapshot = useCallback((): ChartPayload => {
    const nodesCopy = nodesRef.current.map((node) => ({
      ...node,
      position: { ...node.position },
      data: node.data && typeof node.data === "object" ? { ...(node.data as any) } : node.data,
    }));
    const edgesCopy = edgesRef.current.map((edge) => ({ ...edge }));
    return { nodes: nodesCopy, edges: edgesCopy };
  }, []);

  const OrgBoxNode = useCallback(
    ({ id, data }: NodeProps<OrgBoxNodeData>) => {
      const type = data?.entityType ?? (id === "owner" ? "owner" : null);
      let title = data?.label || "Untitled";
      let subtitle: string | null = null;
      let rolePeople: string[] | null = null;
      if (type === "owner") {
        title = "Owner";
        subtitle = ownerName || "";
      } else if (type === "team") {
        const team = data?.entityId ? teamById.get(data.entityId) : null;
        title = team?.name || data?.label || "Team";
      } else if (type === "role") {
        const role = data?.entityId ? roleById.get(data.entityId) : null;
        title = role?.name || data?.label || "Role";
        rolePeople = data?.entityId ? peopleByRoleId.get(data.entityId) || [] : [];
      }

      return (
        <div
          style={{
            padding: 10,
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            background: "#fff",
            minWidth: 160,
            position: "relative",
          }}
          onMouseEnter={() => setHoveredNodeId(id)}
          onMouseLeave={() => {
            setHoveredNodeId(null);
            setHoverEditNodeId((prev) => (prev === id ? null : prev));
          }}
        >
          <Handle
            type="target"
            position={Position.Top}
            style={{ width: 8, height: 8, background: "#94a3b8", border: "1px solid #e2e8f0" }}
          />
          {canManagePeople && hoveredNodeId === id ? (
            <div
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              style={{
                position: "absolute",
                top: 6,
                right: 6,
                display: "grid",
                gap: 4,
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 6,
                padding: 6,
                boxShadow: "0 2px 6px rgba(15, 23, 42, 0.08)",
                zIndex: 2,
              }}
            >
              {type === "owner" ? (
                <>
                  <select
                    value={selectedTeamId}
                    onChange={(event) => setSelectedTeamId(event.target.value)}
                    disabled={!teams.length}
                    style={{
                      padding: "4px 6px",
                      borderRadius: 6,
                      border: "1px solid #e5e7eb",
                      fontSize: 12,
                      opacity: !teams.length ? 0.6 : 1,
                      cursor: !teams.length ? "not-allowed" : "pointer",
                    }}
                  >
                    {teams.length ? (
                      teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))
                    ) : (
                      <option value="">No teams</option>
                    )}
                  </select>
                  <button
                    type="button"
                    onClick={() => addTeamRef.current?.()}
                    disabled={!teams.length || !selectedTeamId}
                    style={{
                      padding: "4px 6px",
                      borderRadius: 6,
                      border: "1px solid #111827",
                      background: "#111827",
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: 12,
                      opacity: !teams.length || !selectedTeamId ? 0.6 : 1,
                      cursor: !teams.length || !selectedTeamId ? "not-allowed" : "pointer",
                    }}
                  >
                    + Team
                  </button>
                </>
              ) : null}
              {id !== "owner" && (type === "team" || type === "role") ? (
                <>
                  {hoverEditNodeId === id ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <button
                        type="button"
                        onClick={() => setHoverEditNodeId((prev) => (prev === id ? null : id))}
                        style={{
                          padding: "4px 6px",
                          borderRadius: 6,
                          border: "1px solid #111827",
                          background: "#111827",
                          color: "#fff",
                          fontWeight: 700,
                          fontSize: 12,
                        }}
                      >
                        Editing
                      </button>
                      <button
                        type="button"
                        onClick={() => setHoverEditNodeId(null)}
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 6,
                          border: "1px solid #e5e7eb",
                          background: "#fff",
                          color: "#111827",
                          fontWeight: 800,
                          lineHeight: "1",
                          cursor: "pointer",
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setHoverEditNodeId((prev) => (prev === id ? null : id))}
                      style={{
                        padding: "4px 6px",
                        borderRadius: 6,
                        border: "1px solid #111827",
                        background: "#fff",
                        color: "#111827",
                        fontWeight: 700,
                        fontSize: 12,
                      }}
                    >
                      Edit
                    </button>
                  )}
                  {hoverEditNodeId === id && type === "team" ? (
                    <select
                      ref={hoverEditSelectRef}
                      value={typeof data?.entityId === "string" ? data.entityId : ""}
                      onChange={(event) => {
                        const teamId = event.target.value || null;
                        const label = teamId ? teamById.get(teamId)?.name || "Team" : "Team";
                        updateNodeDataByIdRef.current?.(id, { entityType: "team", entityId: teamId, label });
                        setHoverEditNodeId(null);
                      }}
                      disabled={!teams.length}
                      style={{
                        padding: "4px 6px",
                        borderRadius: 6,
                        border: "1px solid #e5e7eb",
                        fontSize: 12,
                        opacity: !teams.length ? 0.6 : 1,
                        cursor: !teams.length ? "not-allowed" : "pointer",
                      }}
                    >
                      {teams.length ? (
                        teams.map((team) => (
                          <option key={team.id} value={team.id}>
                            {team.name}
                          </option>
                        ))
                      ) : (
                        <option value="">No teams</option>
                      )}
                    </select>
                  ) : null}
                  {hoverEditNodeId === id && type === "role" ? (
                    <select
                      ref={hoverEditSelectRef}
                      value={typeof data?.entityId === "string" ? data.entityId : ""}
                      onChange={(event) => {
                        const roleId = event.target.value || null;
                        const label = roleId ? roleById.get(roleId)?.name || "Role" : "Role";
                        updateNodeDataByIdRef.current?.(id, { entityType: "role", entityId: roleId, label });
                        setHoverEditNodeId(null);
                      }}
                      disabled={!roleOptions.length}
                      style={{
                        padding: "4px 6px",
                        borderRadius: 6,
                        border: "1px solid #e5e7eb",
                        fontSize: 12,
                        opacity: !roleOptions.length ? 0.6 : 1,
                        cursor: !roleOptions.length ? "not-allowed" : "pointer",
                      }}
                    >
                      {roleOptions.length ? (
                        roleOptions.map((role) => (
                          <option key={role.id} value={role.id}>
                            {role.label}
                          </option>
                        ))
                      ) : (
                        <option value="">No roles</option>
                      )}
                    </select>
                  ) : null}
                </>
              ) : null}
              {hoverEditNodeId !== id ? (
                <>
                  <button
                    type="button"
                    onClick={() => addChildForNodeRef.current?.(id)}
                    style={{
                      padding: "4px 6px",
                      borderRadius: 6,
                      border: "1px solid #111827",
                      background: "#fff",
                      color: "#111827",
                      fontWeight: 700,
                      fontSize: 12,
                    }}
                  >
                    + Child
                  </button>
                  {id !== "owner" && type !== "owner" ? (
                    <button
                      type="button"
                      onClick={() => addSiblingForNodeRef.current?.(id)}
                      style={{
                        padding: "4px 6px",
                        borderRadius: 6,
                        border: "1px solid #111827",
                        background: "#fff",
                        color: "#111827",
                        fontWeight: 700,
                        fontSize: 12,
                      }}
                    >
                      + Sibling
                    </button>
                  ) : null}
                  {id !== "owner" && type !== "owner" ? (
                    <button
                      type="button"
                      onClick={() => deleteNodeByIdRef.current?.(id)}
                      style={{
                        padding: "4px 6px",
                        borderRadius: 6,
                        border: "1px solid #b91c1c",
                        background: "#fff",
                        color: "#b91c1c",
                        fontWeight: 700,
                        fontSize: 12,
                      }}
                    >
                      Delete
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}
          <div style={{ fontWeight: 700 }}>{title}</div>
          {subtitle ? <div style={{ fontSize: 12, color: "#6b7280" }}>{subtitle}</div> : null}
          {type === "role" ? (
            <div style={{ marginTop: 6, fontSize: 12, color: "#374151", display: "grid", gap: 2 }}>
              {rolePeople && rolePeople.length ? (
                rolePeople.map((name) => <div key={name}>{name}</div>)
              ) : (
                <div>No people</div>
              )}
            </div>
          ) : null}
          <Handle
            type="source"
            position={Position.Bottom}
            style={{ width: 8, height: 8, background: "#94a3b8", border: "1px solid #e2e8f0" }}
          />
        </div>
      );
    },
    [
      canManagePeople,
      hoverEditNodeId,
      hoveredNodeId,
      ownerName,
      peopleByRoleId,
      roleById,
      roleOptions,
      selectedTeamId,
      setHoverEditNodeId,
      setHoveredNodeId,
      setSelectedTeamId,
      teamById,
      teams,
    ]
  );

  const nodeTypes = useMemo(() => ({ orgBox: OrgBoxNode }), [OrgBoxNode]);

  const pushHistory = useCallback(() => {
    const current = snapshot();
    const past = historyPastRef.current;
    const last = past[past.length - 1];
    if (last && JSON.stringify(last) === JSON.stringify(current)) return;
    historyPastRef.current = [...past, current];
    historyFutureRef.current = [];
  }, [snapshot]);

  const markChanged = useCallback(() => {
    setDirty(true);
    setSaveState((prev) => (prev.error || prev.success ? { ...prev, error: null, success: false } : prev));
  }, []);

  const addNode = () => {
    if (!canManagePeople) return;
    pushHistory();
    setNodes((prev) => {
      const nextId = `node-${nextIdRef.current}`;
      nextIdRef.current += 1;
      const nextX = 250;
      const nextY = 40 + prev.length * 40;
      return [
        ...prev,
        {
          id: nextId,
          type: "orgBox",
          position: { x: nextX, y: nextY },
          data: { label: "New box", entityType: null, entityId: null },
        },
      ];
    });
    markChanged();
  };

  const addChild = () => {
    if (!canManagePeople) return;
    const parentId = selectedNodeId || "owner";
    const parent = getNodeById(parentId) || getNodeById("owner");
    if (!parent) return;
    pushHistory();
    const childCount = edges.filter((edge) => edge.source === parent.id).length;
    const childId = `node-${nextIdRef.current}`;
    nextIdRef.current += 1;
    const childNode: Node = {
      id: childId,
      type: "orgBox",
      position: {
        x: parent.position.x + childCount * 220,
        y: parent.position.y + 140,
      },
      data: { label: "New box", entityType: null, entityId: null },
    };
    const edgeId = `e-${parent.id}-${childId}-${Date.now()}`;
    setNodes((prev) => [...prev, childNode]);
    setEdges((prev) => [...prev, { id: edgeId, source: parent.id, target: childId }]);
    setSelectedNodeId(childId);
    setSelectedEdgeId(null);
    markChanged();
  };

  const addChildForNode = useCallback(
    (parentId: string) => {
      if (!canManagePeople) return;
      const parent = getNodeById(parentId) || getNodeById("owner");
      if (!parent) return;
      pushHistory();
      const childCount = edges.filter((edge) => edge.source === parent.id).length;
      const childId = `node-${nextIdRef.current}`;
      nextIdRef.current += 1;
      const childNode: Node = {
        id: childId,
        type: "orgBox",
        position: {
          x: parent.position.x + childCount * 220,
          y: parent.position.y + 140,
        },
        data: { label: "New box", entityType: null, entityId: null },
      };
      const edgeId = `e-${parent.id}-${childId}-${Date.now()}`;
      setNodes((prev) => [...prev, childNode]);
      setEdges((prev) => [...prev, { id: edgeId, source: parent.id, target: childId }]);
      setSelectedNodeId(childId);
      setSelectedEdgeId(null);
      markChanged();
    },
    [canManagePeople, edges, getNodeById, markChanged, pushHistory, setEdges, setNodes]
  );

  const addSiblingForNode = useCallback(
    (nodeId: string) => {
      if (!canManagePeople) return;
      const incoming = edges.find((edge) => edge.target === nodeId);
      const parentId = incoming?.source || "owner";
      addChildForNode(parentId);
    },
    [addChildForNode, canManagePeople, edges]
  );

  const deleteNodeById = useCallback(
    (nodeId: string) => {
      if (!canManagePeople || nodeId === "owner") return;
      if (!window.confirm("Delete this node?")) return;
      const edgeWasConnected =
        !!selectedEdgeId &&
        edges.some((edge) => edge.id === selectedEdgeId && (edge.source === nodeId || edge.target === nodeId));
      pushHistory();
      setNodes((prev) => prev.filter((node) => node.id !== nodeId));
      setEdges((prev) => prev.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
      if (selectedNodeId === nodeId) setSelectedNodeId(null);
      if (edgeWasConnected) setSelectedEdgeId(null);
      markChanged();
    },
    [canManagePeople, edges, markChanged, pushHistory, selectedEdgeId, selectedNodeId, setEdges, setNodes]
  );

  const addTeam = () => {
    if (!canManagePeople || !selectedTeamId) return;
    const owner = getNodeById("owner");
    const team = teamById.get(selectedTeamId);
    if (!owner || !team) return;
    const exists = nodes.some((node) => {
      const data = node.data as OrgBoxNodeData;
      return data?.entityType === "team" && data.entityId === team.id;
    });
    if (exists) return;
    pushHistory();
    const childCount = edges.filter((edge) => edge.source === owner.id).length;
    const teamNodeId = `node-${nextIdRef.current}`;
    nextIdRef.current += 1;
    const teamNode: Node = {
      id: teamNodeId,
      type: "orgBox",
      position: { x: owner.position.x + childCount * 220, y: owner.position.y + 160 },
      data: { label: team.name, entityType: "team", entityId: team.id },
    };
    const edgeId = `e-${owner.id}-${teamNodeId}-${Date.now()}`;
    setNodes((prev) => [...prev, teamNode]);
    setEdges((prev) => [...prev, { id: edgeId, source: owner.id, target: teamNodeId }]);
    setSelectedNodeId(teamNodeId);
    setSelectedEdgeId(null);
    markChanged();
  };

  useEffect(() => {
    addTeamRef.current = addTeam;
  }, [addTeam]);

  useEffect(() => {
    addChildForNodeRef.current = addChildForNode;
  }, [addChildForNode]);

  useEffect(() => {
    addSiblingForNodeRef.current = addSiblingForNode;
  }, [addSiblingForNode]);

  useEffect(() => {
    deleteNodeByIdRef.current = deleteNodeById;
  }, [deleteNodeById]);

  const tidyLayout = () => {
    if (!canManagePeople) return;
    pushHistory();
    const depthById = new Map<string, number>();
    const queue: string[] = [];
    if (getNodeById("owner")) {
      depthById.set("owner", 0);
      queue.push("owner");
    }

    const childrenBySource = new Map<string, string[]>();
    edges.forEach((edge) => {
      if (!edge.source || !edge.target) return;
      const list = childrenBySource.get(edge.source) || [];
      list.push(edge.target);
      childrenBySource.set(edge.source, list);
    });

    while (queue.length) {
      const current = queue.shift();
      if (!current) continue;
      const depth = depthById.get(current) ?? 0;
      const children = childrenBySource.get(current) || [];
      children.forEach((childId) => {
        if (depthById.has(childId)) return;
        depthById.set(childId, depth + 1);
        queue.push(childId);
      });
    }

    const depthGroups = new Map<number, string[]>();
    nodes.forEach((node) => {
      const depth = depthById.get(node.id);
      if (depth == null) return;
      const list = depthGroups.get(depth) || [];
      list.push(node.id);
      depthGroups.set(depth, list);
    });

    const positions: Record<string, { x: number; y: number }> = {};
    const startX = 120;
    const stepX = 220;
    const baseY = 40;
    const stepY = 160;

    Array.from(depthGroups.keys())
      .sort((a, b) => a - b)
      .forEach((depth) => {
        const ids = depthGroups.get(depth) || [];
        const rowIds = depth === 0 ? ids.filter((id) => id !== "owner") : ids;
        rowIds.forEach((id, index) => {
          positions[id] = { x: startX + index * stepX, y: baseY + depth * stepY };
        });
      });

    if (getNodeById("owner")) {
      positions["owner"] = { x: 250, y: baseY };
    }

    const unplaced = nodes.filter((node) => !depthById.has(node.id));
    if (unplaced.length) {
      const rowCount =
        (depthGroups.get(0) || []).filter((id) => id !== "owner").length + (positions["owner"] ? 1 : 0);
      const startUnplacedX = startX + rowCount * stepX + 220;
      unplaced.forEach((node, index) => {
        positions[node.id] = { x: startUnplacedX + index * stepX, y: baseY };
      });
    }

    setNodes((prev) => prev.map((node) => (positions[node.id] ? { ...node, position: positions[node.id] } : node)));
    markChanged();
  };

  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      pushHistory();
      onNodesChange(changes);
      markChanged();
    },
    [markChanged, onNodesChange, pushHistory]
  );

  const handleEdgesChange = useCallback(
    (changes: Parameters<typeof onEdgesChange>[0]) => {
      pushHistory();
      onEdgesChange(changes);
      markChanged();
    },
    [markChanged, onEdgesChange, pushHistory]
  );

  const onConnect = useCallback(
    (params: Connection) => {
      if (!canManagePeople) return;
      pushHistory();
      setEdges((eds) => addEdge(params, eds));
      markChanged();
    },
    [canManagePeople, markChanged, pushHistory, setEdges]
  );

  const handleNodeClick = useCallback((_: MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
  }, []);

  const handleEdgeClick = useCallback((_: MouseEvent, edge: Edge) => {
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null);
  }, []);

  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, []);

  const handleLabelChange = (value: string) => {
    if (!selectedNodeId) return;
    pushHistory();
    setNodes((prev) =>
      prev.map((node) =>
        node.id === selectedNodeId ? { ...node, data: { ...(node.data as any), label: value } } : node
      )
    );
    markChanged();
  };

  const updateSelectedNodeData = useCallback(
    (nextData: Partial<OrgBoxNodeData>) => {
      if (!selectedNodeId) return;
      pushHistory();
      setNodes((prev) =>
        prev.map((node) =>
          node.id === selectedNodeId
            ? { ...node, type: "orgBox", data: { ...(node.data as any), ...nextData } }
            : node
        )
      );
      markChanged();
    },
    [markChanged, pushHistory, selectedNodeId, setNodes]
  );

  const updateNodeDataById = useCallback(
    (nodeId: string, nextData: Partial<OrgBoxNodeData>) => {
      if (!canManagePeople || nodeId === "owner") return;
      pushHistory();
      setNodes((prev) =>
        prev.map((node) =>
          node.id === nodeId ? { ...node, type: "orgBox", data: { ...(node.data as any), ...nextData } } : node
        )
      );
      markChanged();
    },
    [canManagePeople, markChanged, pushHistory, setNodes]
  );

  useEffect(() => {
    updateNodeDataByIdRef.current = updateNodeDataById;
  }, [updateNodeDataById]);

  const selectedEntityType =
    selectedNode?.id === "owner" ? "owner" : ((selectedNode?.data as OrgBoxNodeData)?.entityType ?? null);
  const selectedEntityIdRaw = (selectedNode?.data as OrgBoxNodeData)?.entityId ?? null;
  const selectedEntityId = typeof selectedEntityIdRaw === "string" ? selectedEntityIdRaw : "";

  const handleEntityTypeChange = (value: string) => {
    if (!selectedNode) return;
    if (value === "team") {
      const nextTeamId = teams.find((team) => team.id === selectedEntityId)?.id ?? teams[0]?.id ?? null;
      const label = nextTeamId ? teamById.get(nextTeamId)?.name || "Team" : selectedNode.data?.label || "Team";
      updateSelectedNodeData({ entityType: "team", entityId: nextTeamId, label });
      return;
    }
    if (value === "role") {
      const nextRoleId = roleOptions.find((role) => role.id === selectedEntityId)?.id ?? roleOptions[0]?.id ?? null;
      const label = nextRoleId ? roleById.get(nextRoleId)?.name || "Role" : selectedNode.data?.label || "Role";
      updateSelectedNodeData({ entityType: "role", entityId: nextRoleId, label });
      return;
    }
    updateSelectedNodeData({ entityType: null, entityId: null });
  };

  const handleTeamChange = (teamId: string) => {
    if (!selectedNode) return;
    const nextId = teamId || null;
    const label = nextId ? teamById.get(nextId)?.name || "Team" : selectedNode.data?.label || "Team";
    updateSelectedNodeData({ entityType: "team", entityId: nextId, label });
  };

  const handleRoleChange = (roleId: string) => {
    if (!selectedNode) return;
    const nextId = roleId || null;
    const label = nextId ? roleById.get(nextId)?.name || "Role" : selectedNode.data?.label || "Role";
    updateSelectedNodeData({ entityType: "role", entityId: nextId, label });
  };

  const addRolesForSelectedTeam = useCallback(() => {
    if (!canManagePeople || !selectedNodeId || selectedEntityType !== "team") return;
    const teamId = selectedEntityId;
    if (!teamId) return;
    const team = teamById.get(teamId);
    const teamNode = selectedNodeId ? getNodeById(selectedNodeId) : null;
    if (!team || !teamNode) return;

    const existingRoleIds = new Set(
      nodes
        .map((node) => node.data as OrgBoxNodeData)
        .filter((data) => data?.entityType === "role" && typeof data.entityId === "string")
        .map((data) => data.entityId as string)
    );

    const additions: Node[] = [];
    const newEdges: Edge[] = [];
    const baseX = teamNode.position.x;
    const baseY = teamNode.position.y + 160;
    let offsetIndex = 0;

    team.roles.forEach((role) => {
      if (existingRoleIds.has(role.id)) return;
      const roleNodeId = `node-${nextIdRef.current}`;
      nextIdRef.current += 1;
      additions.push({
        id: roleNodeId,
        type: "orgBox",
        position: { x: baseX + offsetIndex * 220, y: baseY },
        data: { label: role.name, entityType: "role", entityId: role.id },
      });
      const edgeId = `e-${teamNode.id}-${roleNodeId}-${Date.now()}`;
      newEdges.push({
        id: edgeId,
        source: teamNode.id,
        target: roleNodeId,
        type: "smoothstep",
      });
      offsetIndex += 1;
    });

    if (!additions.length) return;
    pushHistory();
    setNodes((prev) => [...prev, ...additions]);
    setEdges((prev) => [...prev, ...newEdges]);
    markChanged();
  }, [
    canManagePeople,
    getNodeById,
    markChanged,
    nodes,
    pushHistory,
    selectedEntityId,
    selectedEntityType,
    selectedNodeId,
    setEdges,
    setNodes,
    teamById,
  ]);

  const deleteSelectedNode = () => {
    if (!selectedNodeId || selectedNodeId === "owner") return;
    pushHistory();
    setNodes((prev) => prev.filter((node) => node.id !== selectedNodeId));
    setEdges((prev) => prev.filter((edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId));
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    markChanged();
  };

  const deleteSelectedEdge = () => {
    if (!selectedEdgeId) return;
    pushHistory();
    setEdges((prev) => prev.filter((edge) => edge.id !== selectedEdgeId));
    setSelectedEdgeId(null);
    markChanged();
  };

  const undo = useCallback(() => {
    if (!canManagePeople) return;
    const past = historyPastRef.current;
    if (!past.length) return;
    const current = snapshot();
    const prev = past[past.length - 1];
    historyPastRef.current = past.slice(0, -1);
    historyFutureRef.current = [...historyFutureRef.current, current];
    setNodes(prev.nodes);
    setEdges(prev.edges);
    markChanged();
  }, [canManagePeople, markChanged, setEdges, setNodes, snapshot]);

  const redo = useCallback(() => {
    if (!canManagePeople) return;
    const future = historyFutureRef.current;
    if (!future.length) return;
    const current = snapshot();
    const next = future[future.length - 1];
    historyFutureRef.current = future.slice(0, -1);
    historyPastRef.current = [...historyPastRef.current, current];
    setNodes(next.nodes);
    setEdges(next.edges);
    markChanged();
  }, [canManagePeople, markChanged, setEdges, setNodes, snapshot]);

  useEffect(() => {
    if (!canManagePeople) return;

    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target) {
        const tagName = target.tagName;
        if (target.isContentEditable || tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
          return;
        }
      }

      if (!event.metaKey && !event.ctrlKey) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
        return;
      }
      if (key === "y" || (key === "z" && event.shiftKey)) {
        event.preventDefault();
        redo();
      }
    };

    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, [canManagePeople, redo, undo]);

  async function saveChart() {
    if (!canManagePeople || !dirty) return;
    setSaveState({ saving: true, error: null, success: false });
    try {
      const payload: ChartPayload = { nodes, edges };
      const res = await fetch("/api/org-chart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chart: payload }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Save failed");
      }
      setDirty(false);
      setSaveState({ saving: false, error: null, success: true });
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        setSaveState((prev) => (prev.success ? { ...prev, success: false } : prev));
      }, 2000);
    } catch (err: any) {
      setSaveState({ saving: false, error: err?.message || "Save failed", success: false });
    }
  }

  const showInspector = canManagePeople && (selectedEdge || (selectedNode && selectedNode.id !== "owner"));

  return (
    <div className="surface" style={{ padding: 16, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ fontWeight: 700 }}>Org Chart</div>
        {canManagePeople ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              onClick={addNode}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #111827",
                background: "#111827",
                color: "#fff",
                fontWeight: 700,
              }}
            >
              + Add box
            </button>
            <button
              type="button"
              onClick={addChild}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #111827",
                background: "#fff",
                color: "#111827",
                fontWeight: 700,
              }}
            >
              Add child
            </button>
            <button
              type="button"
              onClick={tidyLayout}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #111827",
                background: "#fff",
                color: "#111827",
                fontWeight: 700,
              }}
            >
              Tidy
            </button>
            <button
              type="button"
              onClick={saveChart}
              disabled={!dirty || saveState.saving}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #111827",
                background: "#fff",
                color: "#111827",
                fontWeight: 700,
                opacity: !dirty || saveState.saving ? 0.6 : 1,
                cursor: !dirty || saveState.saving ? "not-allowed" : "pointer",
              }}
            >
              {saveState.saving ? "Saving…" : "Save"}
            </button>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
              <input type="checkbox" checked={snap} onChange={(event) => setSnap(event.target.checked)} />
              Snap
            </label>
          </div>
        ) : null}
      </div>
      <div style={{ fontSize: 12, color: "#6b7280", display: "flex", gap: 12, flexWrap: "wrap" }}>
        <span>{canManagePeople ? "Local-only. Changes are not saved yet." : "Read-only view."}</span>
        {loading ? <span>Loading chart…</span> : null}
        {loadError ? <span style={{ color: "#b91c1c" }}>{loadError}</span> : null}
        {loadError ? (
          <button
            type="button"
            onClick={loadChart}
            disabled={loading}
            style={{
              padding: "4px 8px",
              borderRadius: 6,
              border: "1px solid #e5e7eb",
              background: "#fff",
              color: "#111827",
              fontWeight: 600,
            }}
          >
            Retry
          </button>
        ) : null}
        {saveState.error ? <span style={{ color: "#b91c1c" }}>{saveState.error}</span> : null}
        {saveState.success ? <span style={{ color: "#065f46" }}>Saved</span> : null}
      </div>
      {showInspector ? (
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            padding: 12,
            display: "grid",
            gap: 10,
            background: "#fff",
          }}
        >
          <div style={{ fontWeight: 700 }}>Inspector</div>
          {selectedNode ? (
            <div style={{ display: "grid", gap: 8 }}>
              {selectedNode.id !== "owner" ? (
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontWeight: 600 }}>Type</span>
                  <select
                    value={selectedEntityType ?? ""}
                    onChange={(event) => handleEntityTypeChange(event.target.value)}
                    style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
                  >
                    <option value="">None</option>
                    <option value="team">Team</option>
                    <option value="role">Role</option>
                  </select>
                </label>
              ) : null}
              {selectedNode.id !== "owner" && selectedEntityType === "team" ? (
                <div style={{ display: "grid", gap: 8 }}>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontWeight: 600 }}>Team</span>
                    <select
                      value={selectedEntityId}
                      onChange={(event) => handleTeamChange(event.target.value)}
                      style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
                    >
                      <option value="">Select team</option>
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedEntityId ? (
                    <button
                      type="button"
                      onClick={addRolesForSelectedTeam}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "1px solid #111827",
                        background: "#fff",
                        color: "#111827",
                        fontWeight: 700,
                        width: "fit-content",
                      }}
                    >
                      Add roles for team
                    </button>
                  ) : null}
                </div>
              ) : null}
              {selectedNode.id !== "owner" && selectedEntityType === "role" ? (
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontWeight: 600 }}>Role</span>
                  <select
                    value={selectedEntityId}
                    onChange={(event) => handleRoleChange(event.target.value)}
                    style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
                  >
                    <option value="">Select role</option>
                    {roleOptions.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontWeight: 600 }}>Label</span>
                <input
                  value={((selectedNode.data as any)?.label as string) || ""}
                  onChange={(event) => handleLabelChange(event.target.value)}
                  disabled={selectedNode.id === "owner"}
                  style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
                />
              </label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  type="button"
                  onClick={deleteSelectedNode}
                  disabled={selectedNodeId === "owner"}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                    color: "#111827",
                    fontWeight: 700,
                    opacity: selectedNodeId === "owner" ? 0.6 : 1,
                    cursor: selectedNodeId === "owner" ? "not-allowed" : "pointer",
                  }}
                >
                  Delete node
                </button>
                {selectedNodeId === "owner" ? (
                  <span style={{ fontSize: 12, color: "#6b7280" }}>Owner node cannot be deleted.</span>
                ) : null}
              </div>
            </div>
          ) : null}
          {selectedEdge ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                type="button"
                onClick={deleteSelectedEdge}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                  color: "#111827",
                  fontWeight: 700,
                }}
              >
                Delete connection
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      <div
        style={{
          height: 420,
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          background: "#fff",
          overflow: "hidden",
        }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          onNodeClick={handleNodeClick}
          onEdgeClick={handleEdgeClick}
          onPaneClick={handlePaneClick}
          nodesDraggable={canManagePeople}
          nodesConnectable={canManagePeople}
          elementsSelectable={canManagePeople}
          snapToGrid={snap}
          snapGrid={[20, 20]}
          fitView
          nodeTypes={nodeTypes}
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}
