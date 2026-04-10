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

import type { LocalMediaItem, UploadedMediaItem, JiraChild, NotionPublishPayload } from "@/app/lib/types";
import { fetchJiraContext, streamReleaseNote, streamRefineNote, uploadFilesSequentially, uploadFile, publishToNotion, convertJiraImagesToS3 } from "@/app/lib/api";
import { transformRawToContext, transformRawChild, type RawIssueNode } from "@/app/lib/jira-transform";
import { saveNote } from "@/app/lib/history";
import { flowNodeTypes, type ReleaseNoteType } from "./flow-nodes";
import { TrashIcon, PlusIcon } from "./icons";
import { FocusIcon, GridIcon } from "./brand-icons";

/* ── Extract Jira attachment URLs from markdown ── */
const JIRA_ATTACHMENT_RE = /https:\/\/cgiarmel\.atlassian\.net\/secure\/attachment\/[^\s)]+/g;
function findJiraImageUrls(md: string): string[] {
  return [...md.matchAll(JIRA_ATTACHMENT_RE)].map((m) => m[0]);
}

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
  rawChildren?: RawIssueNode[],
  jiraBaseUrl?: string,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const nodeW = 700;
  const hSpacing = nodeW + 30;

  children.forEach((child, j) => {
    const nodeId = nid(prefix, `jira-sub-${counter.val++}`);
    const x = parentX + j * hSpacing;
    const y = parentY + BELOW.dy;
    const md = `**${child.key} — ${child.summary}**\n\n_${child.type} · ${child.status}_${child.description ? `\n\n${child.description}` : ""}`;
    const rawChild = rawChildren?.[j];
    const childJiraUrl = jiraBaseUrl ? `${jiraBaseUrl}/browse/${child.key}` : undefined;

    nodes.push({
      id: nodeId, type: "result",
      position: { x, y },
      style: { width: nodeW },
      data: { markdown: md, title: child.key, color: "#0052CC", icon: "jira",
        jiraUrl: childJiraUrl,
        _rawChild: rawChild, _jiraBaseUrl: jiraBaseUrl,
        onFullscreen: () => onFullscreen(md) },
    } as Node);
    edges.push(mkEdge(parentNodeId, "bottom", nodeId, "top"));

    if (child.children?.length) {
      const sub = buildChildSubtree(prefix, nodeId, child.children, x, y, counter, depth + 1, onFullscreen, rawChild?.children, jiraBaseUrl);
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

interface FlowState { jiraKey: string; jiraKeys: string[]; jiraContext: string; }

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

    // Box for forward reference — handleRefine is assigned after handleGenerate
    const refineBox: { fn: ((instruction: string, files: File[]) => Promise<void>) | null } = { fn: null };
    const handleRefine = (instruction: string, files: File[]) => refineBox.fn!(instruction, files);

    const handleJira = async (issueKeys: string[]) => {
      const primaryKey = issueKeys[0] ?? "";
      flowStatesRef.current[prefix].jiraKey = primaryKey;
      flowStatesRef.current[prefix].jiraKeys = issueKeys;
      const jIn = nid(prefix, "jira-input"), jLoad = nid(prefix, "jira-loading");
      const genIn = nid(prefix, "generate-input");

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

        // Store combined jira_context in flow state so generate can reuse it
        const combinedContexts = ctxResults
          .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof fetchJiraContext>>> => r.status === "fulfilled")
          .map((r) => r.value.jira_context);
        flowStatesRef.current[prefix].jiraContext = combinedContexts.join("\n\n---\n\n");

        // Collect child edges populated inside setNodes callback (React processes updaters in FIFO order)
        let childEdges: Edge[] = [];

        setNodes((nds) => {
          const p = findPos(nds, jIn);
          const resultNodes: Node[] = issueKeys.map((key, i) => {
            const res = ctxResults[i];
            const ctx = res.status === "fulfilled"
              ? res.value.jira_context
              : `_Failed to fetch ${key}_`;
            const raw = res.status === "fulfilled" ? res.value.raw : undefined;
            const jiraBaseUrl = res.status === "fulfilled" ? res.value.jira_base_url : undefined;
            return {
              id: nid(prefix, `jira-result-${i}`), type: "result",
              position: { x: p.x + i * RESULT_W, y: p.y + BELOW.dy },
              style: { width: 700 },
              data: { markdown: ctx, title: `Jira: ${key}`, color: "#0052CC", icon: "jira",
                jiraUrl: jiraBaseUrl ? `${jiraBaseUrl}/browse/${key}` : undefined,
                _raw: raw, _jiraBaseUrl: jiraBaseUrl,
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
              const rawChildren = res.value.raw?.children;
              const baseUrl = res.value.jira_base_url;
              const { nodes: subNodes, edges: subEdges } = buildChildSubtree(
                prefix, nid(prefix, `jira-result-${i}`), res.value.children,
                p.x + i * RESULT_W, p.y + BELOW.dy, counter, 0, onFullscreenMarkdown, rawChildren, baseUrl,
              );
              allChildNodes.push(...subNodes);
              childEdges.push(...subEdges);
            }
          });

          const generateX = p.x + Math.max(RIGHT.dx, issueKeys.length * RESULT_W + 30);
          return [
            ...nds.filter((n) => n.id !== jLoad),
            ...resultNodes,
            ...allChildNodes,
            { id: genIn, type: "generateInput",
              position: { x: generateX, y: p.y + RIGHT.dy },
              data: { onSubmit: (m: LocalMediaItem[], e: UploadedMediaItem[], gc: string, nt: ReleaseNoteType) => handleGenerate(m, e, gc, nt), disabled: false } } as Node,
          ];
        });
        setEdges((eds) => {
          const base = eds.filter((e) => !e.id.includes(jLoad));
          const resultEdges = issueKeys.map((_, i) => mkEdge(jIn, "bottom", nid(prefix, `jira-result-${i}`), "top"));
          return [...base, ...resultEdges, ...childEdges, mkEdge(jIn, "right", genIn, "left")];
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
      flowStatesRef.current[prefix] = { jiraKey: "", jiraKeys: [], jiraContext: "" };
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

    const handleGenerateRegenerate = () => {
      const genIn = nid(prefix, "generate-input");
      const genRes = nid(prefix, "generate-result");
      const notionIn = nid(prefix, "notion-input");
      const refineId = nid(prefix, "refine-chat");

      // Re-enable generate-input, remove result + notion + refine nodes
      setNodes((nds) => {
        const genNode = nds.find((n) => n.id === genIn);
        const currentUploaded = (genNode?.data as Record<string, unknown>)?.uploadedMedia as UploadedMediaItem[] ?? [];
        return nds
          .filter((n) => n.id !== genRes && n.id !== notionIn && n.id !== refineId)
          .map((n) => n.id === genIn
            ? { ...n, data: { ...n.data, disabled: false, uploadedMedia: currentUploaded, onSubmit: (m: LocalMediaItem[], e: UploadedMediaItem[], gc: string, nt: ReleaseNoteType) => handleGenerate(m, e, gc, nt), onRegenerate: handleGenerateRegenerate } }
            : n);
      });
      setEdges((eds) => eds.filter((e) => !e.id.includes(genRes) && !e.id.includes(notionIn) && !e.id.includes(refineId)));
    };

    const handleGenerate = async (newLocalMedia: LocalMediaItem[], existingMedia: UploadedMediaItem[], generalContext: string = "", noteType: ReleaseNoteType = "standard") => {
      const genIn = nid(prefix, "generate-input");
      const genLoad = nid(prefix, "generate-loading");
      const genRes = nid(prefix, "generate-result");
      const notionIn = nid(prefix, "notion-input");

      // Remove old result/notion if re-generating
      setNodes((nds) => {
        const p = findPos(nds, genIn);
        return [
          ...nds
            .filter((n) => n.id !== genRes && n.id !== notionIn)
            .map((n) => n.id === genIn ? { ...n, data: { ...n.data, disabled: true } } : n),
          { id: genLoad, type: "loading", position: { x: p.x + BELOW.dx, y: p.y + BELOW.dy },
            data: { label: "Uploading files & generating...", color: "#7c3aed" } } as Node,
        ];
      });
      setEdges((eds) => [...eds.filter((e) => !e.id.includes(genRes) && !e.id.includes(notionIn)), mkEdge(genIn, "bottom", genLoad, "top")]);

      try {
        // Upload new files to S3, keep existing URLs
        const newFiles = newLocalMedia.map((m) => m.file);
        const newUrls = newFiles.length > 0 ? await uploadFilesSequentially(newFiles) : [];
        const newUploaded: UploadedMediaItem[] = newUrls.map((url, i) => ({
          url,
          ai_context: newLocalMedia[i]?.ai_context || "",
          fileName: newLocalMedia[i]?.file.name || "file",
        }));

        const allUploaded = [...existingMedia, ...newUploaded];
        const media = allUploaded.map((m) => ({ url: m.url, ai_context: m.ai_context }));

        const s = st();
        let accumulated = "";
        let isFirstChunk = true;

        onStreamingChange?.(true);

        for await (const chunk of streamReleaseNote({ jira_tickets: s.jiraKeys.length > 0 ? s.jiraKeys : [s.jiraKey], jira_context: s.jiraContext, media, general_context: generalContext, note_type: noteType })) {
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

        onStreamingChange?.(false);

        // Post-generation: convert Jira attachment URLs to S3
        let finalMd = accumulated;
        const jiraUrls = findJiraImageUrls(finalMd);
        if (jiraUrls.length > 0) {
          const mappings = await convertJiraImagesToS3(jiraUrls);
          for (const [jiraUrl, s3Url] of Object.entries(mappings)) {
            finalMd = finalMd.replaceAll(jiraUrl, s3Url);
          }
          // Update the result node with S3 URLs
          setNodes((nds) => nds.map((n) =>
            n.id === genRes
              ? { ...n, data: { ...n.data, markdown: finalMd, onFullscreen: () => onFullscreenMarkdown(finalMd) } }
              : n
          ));
          onFullscreenMarkdown(finalMd);
        }

        const firstHeading = finalMd.match(/^#\s+(.+)$/m)?.[1] || s.jiraKey;
        saveNote({ jiraKey: s.jiraKey, title: firstHeading, markdown: finalMd });

        const refineId = nid(prefix, "refine-chat");

        setNodes((nds) => {
          const genResNode = nds.find((n) => n.id === genRes);
          const gp = genResNode?.position ?? { x: 0, y: 0 };
          return [
            ...nds.map((n) => {
              if (n.id === genRes) return { ...n, data: { ...n.data, streaming: false } };
              if (n.id === genIn) return { ...n, data: { ...n.data, disabled: true, uploadedMedia: allUploaded, onRegenerate: handleGenerateRegenerate } };
              return n;
            }),
            {
              id: refineId, type: "refineChat",
              position: { x: gp.x, y: gp.y + 500 },
              data: { onRefine: handleRefine, streaming: false },
            } as Node,
            {
              id: notionIn, type: "notionInput",
              position: { x: gp.x + 780, y: gp.y },
              data: {
                _title: firstHeading,
                _markdown: finalMd,
                onPublish: (payload: NotionPublishPayload) =>
                  publishToNotion({
                    title: firstHeading,
                    brief_description: payload.brief_description,
                    tag: payload.tag,
                    projects: payload.projects,
                    released_date: new Date().toISOString().split("T")[0],
                    markdown: finalMd,
                    cover_url: payload.cover_url,
                    notion_env: payload.notion_env,
                  }),
              },
            } as Node,
          ];
        });
        setEdges((eds) => [...eds, mkEdge(genRes, "right", notionIn, "left"), mkEdge(genRes, "bottom", refineId, "top")]);
      } catch (err) {
        onStreamingChange?.(false);
        setNodes((nds) => nds.filter((n) => n.id !== genLoad && n.id !== genRes)
          .map((n) => n.id === genIn ? { ...n, data: { ...n.data, disabled: false, onSubmit: (m: LocalMediaItem[], e: UploadedMediaItem[], gc: string, nt: ReleaseNoteType) => handleGenerate(m, e, gc, nt) } } : n));
        setEdges((eds) => eds.filter((e) => !e.id.includes(genLoad) && !e.id.includes(genRes)));
        alert(`Generate error: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    };

    refineBox.fn = async (instruction: string, files: File[]) => {
      const genRes = nid(prefix, "generate-result");
      const notionIn = nid(prefix, "notion-input");
      const refineId = nid(prefix, "refine-chat");

      // Get current markdown from the result node
      const currentNode = nodesRef.current.find((n) => n.id === genRes);
      const currentMd = (currentNode?.data as Record<string, unknown>)?.markdown as string ?? "";

      // Mark refine node as streaming
      setNodes((nds) => nds.map((n) =>
        n.id === refineId ? { ...n, data: { ...n.data, streaming: true } } : n
      ));

      try {
        // Upload images to S3
        const mediaItems: { url: string; ai_context: string }[] = [];
        for (const file of files) {
          const url = await uploadFile(file);
          mediaItems.push({ url, ai_context: instruction });
        }

        const s = st();
        let accumulated = "";

        onStreamingChange?.(true);

        for await (const chunk of streamRefineNote({
          markdown: currentMd,
          instruction,
          media: mediaItems.length > 0 ? mediaItems : undefined,
          jira_context: s.jiraContext || undefined,
        })) {
          accumulated += chunk;
          // Update the result node in real-time
          setNodes((nds) => nds.map((n) =>
            n.id === genRes
              ? { ...n, data: { ...n.data, markdown: accumulated, streaming: true, onFullscreen: () => onFullscreenMarkdown(accumulated) } }
              : n
          ));
          onFullscreenMarkdown(accumulated);
        }

        onStreamingChange?.(false);
        const refinedMd = accumulated;
        const title = refinedMd.match(/^#\s+(.+)$/m)?.[1] || st().jiraKey;

        // Finalize: update result, refine node, and Notion node
        setNodes((nds) => nds.map((n) => {
          if (n.id === genRes) {
            return { ...n, data: { ...n.data, markdown: refinedMd, streaming: false, onFullscreen: () => onFullscreenMarkdown(refinedMd) } };
          }
          if (n.id === refineId) {
            return { ...n, data: { ...n.data, streaming: false } };
          }
          if (n.id === notionIn) {
            return {
              ...n, data: {
                ...n.data,
                _title: title,
                _markdown: refinedMd,
                onPublish: (payload: NotionPublishPayload) =>
                  publishToNotion({
                    title,
                    brief_description: payload.brief_description,
                    tag: payload.tag,
                    projects: payload.projects,
                    released_date: new Date().toISOString().split("T")[0],
                    markdown: refinedMd,
                    cover_url: payload.cover_url,
                    notion_env: payload.notion_env,
                  }),
              },
            };
          }
          return n;
        }));

        // Update history
        saveNote({ jiraKey: st().jiraKey, title, markdown: refinedMd });
      } catch (err) {
        onStreamingChange?.(false);
        setNodes((nds) => nds.map((n) =>
          n.id === refineId ? { ...n, data: { ...n.data, streaming: false } } : n
        ));
        alert(`Refine error: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    };

    return { handleJira, handleJiraReset, handleGenerate, handleGenerateRegenerate, handleRefine };
  }

  /* ── Save canvas on every change ── */
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;

  /* ── Reposition jira-sub-* nodes once measured parent heights are known ── */
  const measuredHeightsRef = useRef<Record<string, number>>({});
  useEffect(() => {
    // Update tracked heights
    let anyNewHeight = false;
    for (const n of nodes) {
      if (!/-jira-(result|sub)-/.test(n.id)) continue;
      const h = (n.measured as { height?: number } | undefined)?.height;
      if (h == null) continue;
      if (measuredHeightsRef.current[n.id] !== h) {
        measuredHeightsRef.current[n.id] = h;
        anyNewHeight = true;
      }
    }
    if (!anyNewHeight) return;

    setNodes((nds) => {
      // Multi-pass: cascade position updates through the tree (parent → child → grandchild)
      const updated = [...nds];
      let anyChanged = false;
      for (let pass = 0; pass < 10; pass++) {
        let passChanged = false;
        for (let i = 0; i < updated.length; i++) {
          const n = updated[i];
          if (!/-jira-sub-/.test(n.id)) continue;
          const parentEdge = edgesRef.current.find((e) => e.target === n.id);
          if (!parentEdge) continue;
          const parent = updated.find((p) => p.id === parentEdge.source);
          if (!parent) continue;
          const ph = measuredHeightsRef.current[parent.id];
          if (ph == null) continue;
          const newY = parent.position.y + ph + 60;
          if (Math.abs(n.position.y - newY) <= 2) continue;
          passChanged = true;
          anyChanged = true;
          updated[i] = { ...n, position: { x: n.position.x, y: newY } };
        }
        if (!passChanged) break;
      }
      return anyChanged ? updated : nds;
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
    const { handleJira, handleJiraReset, handleGenerate, handleGenerateRegenerate, handleRefine } = makeHandlers(prefix);
    const data = { ...n.data };

    if (n.type === "jiraInput") { data.onSubmit = handleJira; data.onReset = handleJiraReset; }
    else if (n.type === "generateInput") {
      data.onSubmit = (m: LocalMediaItem[], e: UploadedMediaItem[], gc: string, nt: ReleaseNoteType) => handleGenerate(m, e, gc, nt);
      data.onRegenerate = handleGenerateRegenerate;
    }
    else if (n.type === "result") {
      const baseUrl = data._jiraBaseUrl as string | undefined;
      // Re-transform from raw data if available (so transform logic changes apply on reload)
      if (data._raw && baseUrl) {
        const { jira_context } = transformRawToContext(data._raw as RawIssueNode, baseUrl);
        data.markdown = jira_context;
        // Reconstruct jiraUrl for main result nodes
        const rawKey = (data._raw as RawIssueNode).key;
        if (rawKey) data.jiraUrl = `${baseUrl}/browse/${rawKey}`;
      }
      // Also re-transform child sub-nodes
      if (data._rawChild) {
        const child = transformRawChild(data._rawChild as RawIssueNode);
        const md = `**${child.key} — ${child.summary}**\n\n*${child.type} · ${child.status}*` +
          (child.description ? `\n\n${child.description}` : "");
        data.markdown = md;
        if (baseUrl) data.jiraUrl = `${baseUrl}/browse/${child.key}`;
      }
      if (typeof data.markdown === "string") data.onFullscreen = () => onFullscreenMarkdown(data.markdown as string);
    }
    else if (n.type === "refineChat") {
      data.onRefine = handleRefine;
      data.streaming = false;
    }
    else if (n.type === "notionInput" && typeof data._markdown === "string") {
      const title = (data._title as string) || "";
      const markdown = data._markdown as string;
      data.onPublish = (payload: NotionPublishPayload) =>
        publishToNotion({ title, brief_description: payload.brief_description, tag: payload.tag, projects: payload.projects, released_date: new Date().toISOString().split("T")[0], markdown, cover_url: payload.cover_url, notion_env: payload.notion_env });
    }

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
      // Filter out nodes with unknown types (e.g. removed githubInput)
      const validNodes = saved.nodes.filter((n) => n.type in flowNodeTypes);
      const validNodeIds = new Set(validNodes.map((n) => n.id));
      const validEdges = saved.edges.filter((e) => validNodeIds.has(e.source) && validNodeIds.has(e.target));
      setNodes(validNodes.map(rehydrateNode));
      setEdges(validEdges);
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
    flowStatesRef.current[prefix] = { jiraKey: "", jiraKeys: [], jiraContext: "" };
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
      flowStatesRef.current[prefix] = { jiraKey: "", jiraKeys: [], jiraContext: "" };
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
    measuredHeightsRef.current = {};

    // Create fresh flow directly (not via createNewFlow which appends)
    const prefix = "f0";
    flowCountRef.current = 1;
    flowStatesRef.current[prefix] = { jiraKey: "", jiraKeys: [], jiraContext: "" };
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
      <div className="absolute top-3 left-3 z-50 flex items-center gap-2">
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
