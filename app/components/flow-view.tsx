"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { LocalMediaItem, JiraChild } from "@/app/lib/types";
import { fetchJiraContext, fetchCommits, streamReleaseNote, uploadFilesSequentially } from "@/app/lib/api";
import { saveNote } from "@/app/lib/history";
import { flowNodeTypes } from "./flow-nodes";
import { TrashIcon, PlusIcon } from "./icons";
import { FocusIcon, GridIcon } from "./brand-icons";

/* ── Offsets relative to the parent node's current position ── */
const BELOW = { dx: 0, dy: 340 };   // result below input
const RIGHT = { dx: 780, dy: 0 };   // next input to the right
const FLOW_GAP_Y = 900;
const RESULT_W = 750; // result node width (700) + horizontal gap (50)

/* ── Recursively create child/grandchild nodes from Jira subtree ── */
function buildChildSubtree(
  prefix: string,
  parentNodeId: string,
  children: JiraChild[],
  parentX: number,
  parentY: number,
  counter: { val: number },
  depth: number,
  onFullscreen: (md: string) => void,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const nodeW = depth === 0 ? 500 : Math.max(380, 500 - depth * 40);
  const hSpacing = nodeW + 20;

  children.forEach((child, j) => {
    const nodeId = nid(prefix, `jira-sub-${counter.val++}`);
    const x = parentX + j * hSpacing;
    const y = parentY + BELOW.dy;
    const md = `**[${child.key}] ${child.summary}**\n\n_${child.type} · ${child.status}_${child.description ? `\n\n${child.description}` : ""}`;

    nodes.push({
      id: nodeId, type: "result",
      position: { x, y },
      style: { width: nodeW },
      data: { markdown: md, title: child.key, color: "#0052CC", icon: "jira",
        onFullscreen: () => onFullscreen(md) },
    } as Node);
    edges.push(mkEdge(parentNodeId, "bottom", nodeId, "top"));

    if (child.children?.length) {
      const sub = buildChildSubtree(prefix, nodeId, child.children, x, y, counter, depth + 1, onFullscreen);
      nodes.push(...sub.nodes);
      edges.push(...sub.edges);
    }
  });

  return { nodes, edges };
}

function mkEdge(src: string, srcH: string, tgt: string, tgtH: string): Edge {
  return {
    id: `${src}:${srcH}->${tgt}:${tgtH}`,
    source: src, sourceHandle: srcH,
    target: tgt, targetHandle: tgtH,
    animated: true,
    style: { stroke: "#22c55e", strokeWidth: 2 },
    markerEnd: { type: MarkerType.ArrowClosed, color: "#22c55e", width: 16, height: 16 },
  };
}

/* ── Persist / restore canvas ── */
const CANVAS_KEY = "flow-canvas-state";

interface FlowState { jiraKey: string; jiraKeys: string[]; owner: string; repo: string; branch: string; }

interface PersistedCanvas {
  flowCount: number;
  flowStates: Record<string, FlowState>;
  nodes: Array<{ id: string; type: string; position: { x: number; y: number }; style?: Record<string, unknown>; data: Record<string, unknown> }>;
  edges: Edge[];
}

function saveCanvasToLS(state: PersistedCanvas) {
  try { localStorage.setItem(CANVAS_KEY, JSON.stringify(state)); } catch { /* */ }
}
function loadCanvasFromLS(): PersistedCanvas | null {
  if (typeof window === "undefined") return null;
  try { const r = localStorage.getItem(CANVAS_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
}

function nid(prefix: string, name: string) { return `${prefix}-${name}`; }

/* Helper: find a node's current position in the array */
function findPos(nds: Node[], id: string) {
  const n = nds.find((n) => n.id === id);
  return n ? n.position : { x: 0, y: 0 };
}

interface FlowViewProps {
  onFullscreenMarkdown: (markdown: string) => void;
  onStreamingChange?: (streaming: boolean) => void;
  onSwitchView: (mode: "panoramic" | "workspace") => void;
}

export function FlowView({ onFullscreenMarkdown, onStreamingChange, onSwitchView }: FlowViewProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([] as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[]);

  const flowStatesRef = useRef<Record<string, FlowState>>({});
  const flowCountRef = useRef(0);
  const initDone = useRef(false);

  /* ── Build handlers for a flow ── */
  function makeHandlers(prefix: string) {
    const st = () => flowStatesRef.current[prefix];

    const handleJira = async (issueKeys: string[]) => {
      const primaryKey = issueKeys[0] ?? "";
      flowStatesRef.current[prefix].jiraKey = primaryKey;
      flowStatesRef.current[prefix].jiraKeys = issueKeys;
      const jIn = nid(prefix, "jira-input"), jLoad = nid(prefix, "jira-loading");
      const gIn = nid(prefix, "github-input");

      const label = issueKeys.length > 1
        ? `Fetching ${issueKeys.length} Jira contexts...`
        : "Fetching Jira Context...";

      setNodes((nds) => {
        const p = findPos(nds, jIn);
        return [
          ...nds.map((n) => n.id === jIn ? { ...n, data: { ...n.data, disabled: true, onReset: handleJiraReset } } : n),
          { id: jLoad, type: "loading", position: { x: p.x + BELOW.dx, y: p.y + BELOW.dy },
            data: { label, color: "#0052CC" } } as Node,
        ];
      });
      setEdges((eds) => [...eds, mkEdge(jIn, "bottom", jLoad, "top")]);

      try {
        const ctxResults = await Promise.allSettled(issueKeys.map((k) => fetchJiraContext([k])));

        // Collect child edges populated inside setNodes callback (React processes updaters in FIFO order)
        let childEdges: Edge[] = [];

        setNodes((nds) => {
          const p = findPos(nds, jIn);
          const resultNodes: Node[] = issueKeys.map((key, i) => {
            const ctx = ctxResults[i].status === "fulfilled"
              ? ctxResults[i].value.jira_context
              : `_Failed to fetch ${key}_`;
            return {
              id: nid(prefix, `jira-result-${i}`), type: "result",
              position: { x: p.x + i * RESULT_W, y: p.y + BELOW.dy },
              style: { width: 700 },
              data: { markdown: ctx, title: `Jira: ${key}`, color: "#0052CC", icon: "jira",
                onFullscreen: () => onFullscreenMarkdown(ctx) },
            } as Node;
          });

          // Build child/grandchild nodes for each result
          childEdges = [];
          const counter = { val: 0 };
          const allChildNodes: Node[] = [];
          issueKeys.forEach((_, i) => {
            const res = ctxResults[i];
            if (res.status === "fulfilled" && res.value.children?.length) {
              const { nodes: subNodes, edges: subEdges } = buildChildSubtree(
                prefix, nid(prefix, `jira-result-${i}`), res.value.children,
                p.x + i * RESULT_W, p.y + BELOW.dy, counter, 0, onFullscreenMarkdown,
              );
              allChildNodes.push(...subNodes);
              childEdges.push(...subEdges);
            }
          });

          const githubX = p.x + Math.max(RIGHT.dx, issueKeys.length * RESULT_W + 30);
          return [
            ...nds.filter((n) => n.id !== jLoad),
            ...resultNodes,
            ...allChildNodes,
            { id: gIn, type: "githubInput",
              position: { x: githubX, y: p.y + RIGHT.dy },
              data: { jiraTicket: primaryKey, onSubmit: (o: string, r: string, b: string) => handleGitHub(o, r, b), disabled: false } } as Node,
          ];
        });
        setEdges((eds) => {
          const base = eds.filter((e) => !e.id.includes(jLoad));
          const resultEdges = issueKeys.map((_, i) => mkEdge(jIn, "bottom", nid(prefix, `jira-result-${i}`), "top"));
          return [...base, ...resultEdges, ...childEdges, mkEdge(jIn, "right", gIn, "left")];
        });
      } catch (err) {
        setNodes((nds) => nds.filter((n) => n.id !== jLoad)
          .map((n) => n.id === jIn ? { ...n, data: { ...n.data, disabled: false, onSubmit: handleJira, onReset: handleJiraReset } } : n));
        setEdges((eds) => eds.filter((e) => !e.id.includes(jLoad)));
        alert(`Jira error: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    };

    /* Re-enable jira-input and wipe all downstream nodes/edges for this flow */
    const handleJiraReset = () => {
      const jIn = nid(prefix, "jira-input");
      flowStatesRef.current[prefix] = { jiraKey: "", jiraKeys: [], owner: "", repo: "", branch: "" };
      setNodes((nds) => nds
        .filter((n) => !n.id.startsWith(prefix + "-") || n.id === jIn)
        .map((n) => n.id === jIn
          ? { ...n, data: { ...n.data, disabled: false, onSubmit: handleJira, onReset: handleJiraReset } }
          : n
        )
      );
      setEdges((eds) => eds.filter(
        (e) => !e.source.startsWith(prefix + "-") && !e.target.startsWith(prefix + "-")
      ));
    };

    const handleGitHub = async (owner: string, repo: string, branch: string) => {
      const s = flowStatesRef.current[prefix];
      s.owner = owner; s.repo = repo; s.branch = branch;
      const gIn = nid(prefix, "github-input"), cLoad = nid(prefix, "commits-loading");
      const cRes = nid(prefix, "commits-result"), genIn = nid(prefix, "generate-input");

      setNodes((nds) => {
        const p = findPos(nds, gIn);
        return [
          ...nds.map((n) => n.id === gIn ? { ...n, data: { ...n.data, disabled: true } } : n),
          { id: cLoad, type: "loading", position: { x: p.x + BELOW.dx, y: p.y + BELOW.dy }, data: { label: "Fetching Commits...", color: "#24292e" } } as Node,
        ];
      });
      setEdges((eds) => [...eds, mkEdge(gIn, "bottom", cLoad, "top")]);

      try {
        const data = await fetchCommits({ owner, repo, branch, jira_ticket: st().jiraKey });
        setNodes((nds) => {
          const p = findPos(nds, gIn);
          return [
            ...nds.filter((n) => n.id !== cLoad),
            { id: cRes, type: "result", position: { x: p.x + BELOW.dx, y: p.y + BELOW.dy }, style: { width: 700 },
              data: { markdown: data.release_notes_input, title: `Commits: ${repo}/${branch}`, color: "#24292e", icon: "github", onFullscreen: () => onFullscreenMarkdown(data.release_notes_input) } } as Node,
            { id: genIn, type: "generateInput", position: { x: p.x + RIGHT.dx, y: p.y + RIGHT.dy },
              data: { onSubmit: (m: LocalMediaItem[]) => handleGenerate(m), disabled: false } } as Node,
          ];
        });
        setEdges((eds) => [
          ...eds.filter((e) => !e.id.includes(cLoad)),
          mkEdge(gIn, "bottom", cRes, "top"),
          mkEdge(gIn, "right", genIn, "left"),
        ]);
      } catch (err) {
        setNodes((nds) => nds.filter((n) => n.id !== cLoad).map((n) => n.id === gIn ? { ...n, data: { ...n.data, disabled: false, onSubmit: (o: string, r: string, b: string) => handleGitHub(o, r, b) } } : n));
        setEdges((eds) => eds.filter((e) => !e.id.includes(cLoad)));
        alert(`GitHub error: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    };

    const handleGenerate = async (localMedia: LocalMediaItem[]) => {
      const genIn = nid(prefix, "generate-input");
      const genLoad = nid(prefix, "generate-loading");
      const genRes = nid(prefix, "generate-result");

      setNodes((nds) => {
        const p = findPos(nds, genIn);
        return [
          ...nds.map((n) => n.id === genIn ? { ...n, data: { ...n.data, disabled: true } } : n),
          { id: genLoad, type: "loading", position: { x: p.x + BELOW.dx, y: p.y + BELOW.dy },
            data: { label: "Uploading files & generating...", color: "#7c3aed" } } as Node,
        ];
      });
      setEdges((eds) => [...eds, mkEdge(genIn, "bottom", genLoad, "top")]);

      try {
        const files = localMedia.map((m) => m.file);
        const urls = files.length > 0 ? await uploadFilesSequentially(files) : [];
        const media = urls.map((url, i) => ({ url, ai_context: localMedia[i]?.ai_context || "" }));

        const s = st();
        let accumulated = "";
        let isFirstChunk = true;

        onStreamingChange?.(true);

        for await (const chunk of streamReleaseNote({ owner: s.owner, repo: s.repo, branch: s.branch, jira_tickets: s.jiraKeys.length > 0 ? s.jiraKeys : [s.jiraKey], media })) {
          accumulated += chunk;

          if (isFirstChunk) {
            isFirstChunk = false;
            setNodes((nds) => {
              const p = findPos(nds, genIn);
              return [
                ...nds.filter((n) => n.id !== genLoad),
                { id: genRes, type: "result", position: { x: p.x + BELOW.dx, y: p.y + BELOW.dy }, style: { width: 750 },
                  data: { markdown: accumulated, title: "Release Note", color: "#7c3aed", icon: "ai", streaming: true,
                    onFullscreen: () => onFullscreenMarkdown(accumulated) } } as Node,
              ];
            });
            setEdges((eds) => [...eds.filter((e) => !e.id.includes(genLoad)), mkEdge(genIn, "bottom", genRes, "top")]);
            onFullscreenMarkdown(accumulated);
          } else {
            setNodes((nds) => nds.map((n) =>
              n.id === genRes
                ? { ...n, data: { ...n.data, markdown: accumulated, onFullscreen: () => onFullscreenMarkdown(accumulated) } }
                : n
            ));
            onFullscreenMarkdown(accumulated);
          }
        }

        const firstHeading = accumulated.match(/^#\s+(.+)$/m)?.[1] || s.jiraKey;
        saveNote({ jiraKey: s.jiraKey, title: firstHeading, markdown: accumulated });
        onStreamingChange?.(false);
        setNodes((nds) => nds.map((n) => n.id === genRes ? { ...n, data: { ...n.data, streaming: false } } : n));
      } catch (err) {
        onStreamingChange?.(false);
        setNodes((nds) => nds.filter((n) => n.id !== genLoad && n.id !== genRes)
          .map((n) => n.id === genIn ? { ...n, data: { ...n.data, disabled: false, onSubmit: (m: LocalMediaItem[]) => handleGenerate(m) } } : n));
        setEdges((eds) => eds.filter((e) => !e.id.includes(genLoad) && !e.id.includes(genRes)));
        alert(`Generate error: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    };

    return { handleJira, handleJiraReset, handleGitHub, handleGenerate };
  }

  /* ── Save canvas on every change ── */
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;

  /* ── Reposition jira-sub-* nodes once measured parent heights are known ── */
  const measuredHeightsRef = useRef<Record<string, number>>({});
  useEffect(() => {
    // Track whether any relevant parent node changed its measured height
    let parentChanged = false;
    for (const n of nodes) {
      if (!/-jira-(result|sub)-/.test(n.id)) continue;
      const h = (n.measured as { height?: number } | undefined)?.height;
      if (h == null) continue;
      if (measuredHeightsRef.current[n.id] !== h) {
        measuredHeightsRef.current[n.id] = h;
        parentChanged = true;
      }
    }
    if (!parentChanged) return;

    setNodes((nds) => {
      let changed = false;
      const next = nds.map((n) => {
        if (!/-jira-sub-/.test(n.id)) return n;
        const parentEdge = edgesRef.current.find((e) => e.target === n.id);
        if (!parentEdge) return n;
        const parent = nds.find((p) => p.id === parentEdge.source);
        const ph = (parent?.measured as { height?: number } | undefined)?.height;
        if (!parent || ph == null) return n;
        const newY = parent.position.y + ph + 50;
        if (Math.abs(n.position.y - newY) <= 2) return n;
        changed = true;
        return { ...n, position: { x: n.position.x, y: newY } };
      });
      return changed ? next : nds;
    });
  }, [nodes]);

  /* ── Save canvas on every change ── */
  useEffect(() => {
    if (!initDone.current) return;
    const serializable = nodesRef.current.map((n) => {
      const cleanData: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(n.data as Record<string, unknown>)) {
        if (typeof v !== "function") cleanData[k] = v;
      }
      return { id: n.id, type: n.type!, position: n.position, style: n.style as Record<string, unknown> | undefined, data: cleanData };
    });
    saveCanvasToLS({ flowCount: flowCountRef.current, flowStates: { ...flowStatesRef.current }, nodes: serializable, edges: edgesRef.current });
  }, [nodes, edges]);

  /* ── Rehydrate node: re-attach callbacks ── */
  function rehydrateNode(n: PersistedCanvas["nodes"][number]): Node {
    const prefix = n.id.split("-")[0];
    const { handleJira, handleJiraReset, handleGitHub, handleGenerate } = makeHandlers(prefix);
    const data = { ...n.data };

    if (n.type === "jiraInput") { data.onSubmit = handleJira; data.onReset = handleJiraReset; }
    else if (n.type === "githubInput") data.onSubmit = (o: string, r: string, b: string) => handleGitHub(o, r, b);
    else if (n.type === "generateInput") data.onSubmit = (m: LocalMediaItem[]) => handleGenerate(m);
    else if (n.type === "result" && typeof data.markdown === "string") data.onFullscreen = () => onFullscreenMarkdown(data.markdown as string);

    return { id: n.id, type: n.type, position: n.position, style: n.style, data } as Node;
  }

  /* ── Init: restore or create first flow ── */
  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;

    const saved = loadCanvasFromLS();
    if (saved && saved.nodes.length > 0) {
      flowCountRef.current = saved.flowCount;
      flowStatesRef.current = saved.flowStates;
      setNodes(saved.nodes.map(rehydrateNode));
      setEdges(saved.edges);
    } else {
      createNewFlow(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Create a new flow at a given y-offset ── */
  function createNewFlow(yOffset: number) {
    const idx = flowCountRef.current;
    flowCountRef.current += 1;
    const prefix = `f${idx}`;
    flowStatesRef.current[prefix] = { jiraKey: "", jiraKeys: [], owner: "", repo: "", branch: "" };
    const { handleJira, handleJiraReset } = makeHandlers(prefix);

    setNodes((nds) => [
      ...nds,
      { id: nid(prefix, "jira-input"), type: "jiraInput", position: { x: 0, y: yOffset }, data: { onSubmit: handleJira, onReset: handleJiraReset, disabled: false } },
    ]);
  }

  /* ── Add new flow below all existing nodes ── */
  const addFlow = useCallback(() => {
    setNodes((nds) => {
      // Find the lowest y among all existing nodes
      let maxY = 0;
      for (const n of nds) {
        if (n.position.y > maxY) maxY = n.position.y;
      }
      const yOffset = maxY + FLOW_GAP_Y;

      const idx = flowCountRef.current;
      flowCountRef.current += 1;
      const prefix = `f${idx}`;
      flowStatesRef.current[prefix] = { jiraKey: "", jiraKeys: [], owner: "", repo: "", branch: "" };
      const { handleJira, handleJiraReset } = makeHandlers(prefix);

      return [
        ...nds,
        { id: nid(prefix, "jira-input"), type: "jiraInput", position: { x: 0, y: yOffset }, data: { onSubmit: handleJira, onReset: handleJiraReset, disabled: false } },
      ];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setNodes]);

  /* ── Clear all ── */
  const handleClearAll = useCallback(() => {
    localStorage.removeItem(CANVAS_KEY);
    flowCountRef.current = 0;
    flowStatesRef.current = {};
    initDone.current = true;

    // Create fresh flow directly (not via createNewFlow which appends)
    const prefix = "f0";
    flowCountRef.current = 1;
    flowStatesRef.current[prefix] = { jiraKey: "", jiraKeys: [], owner: "", repo: "", branch: "" };
    const { handleJira, handleJiraReset } = makeHandlers(prefix);

    setNodes([
      { id: nid(prefix, "jira-input"), type: "jiraInput", position: { x: 0, y: 0 }, data: { onSubmit: handleJira, onReset: handleJiraReset, disabled: false } },
    ]);
    setEdges([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setNodes, setEdges]);

  return (
    <div className="relative w-full h-full">
      {/* Toolbar */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
        <button onClick={() => onSwitchView("panoramic")}
          className="rounded-lg bg-[#2a2a3e] border border-white/10 px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-[#353550] hover:text-white shadow-lg transition-colors flex items-center gap-1.5">
          <FocusIcon className="w-3 h-3" /> Focus
        </button>
        <button onClick={() => onSwitchView("workspace")}
          className="rounded-lg bg-[#2a2a3e] border border-white/10 px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-[#353550] hover:text-white shadow-lg transition-colors flex items-center gap-1.5">
          <GridIcon className="w-3 h-3" /> Workspace
        </button>
        <button onClick={addFlow}
          className="rounded-lg bg-[#2a2a3e] border border-white/10 px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-[#353550] hover:text-white shadow-lg transition-colors flex items-center gap-1.5">
          <PlusIcon className="w-3 h-3" /> New Flow
        </button>
        <button onClick={handleClearAll}
          className="rounded-lg bg-[#2a2a3e] border border-red-500/20 px-3 py-1.5 text-xs font-medium text-red-400/80 hover:bg-red-500/10 hover:text-red-400 shadow-lg transition-colors flex items-center gap-1.5">
          <TrashIcon className="w-3 h-3" /> Clear All
        </button>
      </div>

      <ReactFlow
        nodes={nodes} edges={edges}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        nodeTypes={flowNodeTypes}
        fitView fitViewOptions={{ padding: 0.4, maxZoom: 0.85 }}
        minZoom={0.1} maxZoom={2}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ animated: true, style: { stroke: "#22c55e", strokeWidth: 2 } }}
        style={{ background: "#13131f" }}
      >
        <Background color="#ffffff12" gap={24} size={1.5} />
        <Controls showInteractive={false} position="bottom-right" className="!rounded-lg !border-white/10 !shadow-xl" style={{ background: "#2a2a3e" }} />
        <MiniMap nodeColor="#22c55e" maskColor="rgba(0,0,0,0.7)" className="!rounded-lg !border-white/10" style={{ background: "#1a1a2e" }} position="bottom-left" />
      </ReactFlow>
    </div>
  );
}
