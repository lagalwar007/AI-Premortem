import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Controls,
    Handle,
    Position,
    ReactFlow,
    ReactFlowProvider,
    useReactFlow,
    type Edge,
    type Node,
    type NodeProps,
} from "@xyflow/react";
import { API_END_POINT, API_PORT, API_URL } from "./config";

// ---- API payload shapes -----------------------------------------------
// These mirror the SSE events emitted by POST /premortem exactly:
//   event: checkpoint      -> { checkpoint, failure_modes: FailureMode[], error? }
//   event: critical_risk   -> { critical_risk: CriticalRisk | null, error? }

type Probability = "low" | "medium" | "high";

export type FailureMode = {
    description: string;
    probability: Probability;
    severity: number;
    mitigation: string;
};

type CheckpointEvent = {
    checkpoint: string;
    failure_modes: FailureMode[];
    error?: string;
};

type CriticalRisk = {
    description: string;
    why_overlooked: string;
    severity: number;
    mitigation: string;
    source_checkpoint?: string;
    source_failure_description?: string;
};

type FailureNodeData = FailureMode & {
    checkpoint: string;
    isCritical: boolean;
    onReveal: (failure: FailureNodeData) => void;
};

type CheckpointStatus = "queued" | "analyzing" | "complete" | "error";

/** One row of app state per checkpoint — the single source of truth the whole tree is derived from. */
type CheckpointResult = {
    checkpoint: string;
    status: CheckpointStatus;
    failures: FailureMode[];
};

type CheckpointNodeData = {
    name: string;
    status: CheckpointStatus;
};

type PlanNodeData = {
    plan: string;
};

type PremortemFlowProps = {
    plan: string;
    model: string;
    /** Defaults to the FastAPI endpoint served from the same origin. */
    endpoint?: string;
};

const CHECKPOINTS = ["Month 1", "Month 6", "Year 1"];

// ---- Layout constants ---------------------------------------------------
// Checkpoints run down a single vertical column. The plan sits to the left,
// vertically centred on that column. Each checkpoint's failure cards fan out
// to the right of it, centred on the checkpoint's own y position.
//
// Every failure card is a fixed size (see FailureNode), so the gap between
// checkpoints below is a *guarantee*, not an estimate: even a full 3-card
// fan on two neighbouring checkpoints can never reach each other.
//
// IMPORTANT: any per-card rotation/animation lives on our own inner element
// (see FailureNode), never on the Node object's own `className`/`style` —
// that lands on the wrapper React Flow uses for its own position transform,
// and a competing CSS `transform` there silently breaks positioning.
const PLAN_X = 40;
const CHECKPOINT_X = 380;
const CHECKPOINT_GAP_Y = 420;
const FAILURE_X = CHECKPOINT_X + 420;
const FAILURE_CARD_WIDTH = 272;
const FAILURE_CARD_HEIGHT = 100;
const FAILURE_ROW_STEP = FAILURE_CARD_HEIGHT + 30;
const CALLOUT_X = FAILURE_X + FAILURE_CARD_WIDTH + 140;

// Plan is vertically centred on the checkpoint column (aligned with the
// middle checkpoint when there are three, as in the reference design).
const PLAN_Y = Math.floor((CHECKPOINTS.length - 1) / 2) * CHECKPOINT_GAP_Y;

// Deterministic small tilt per card index, so the board reads as pinned
// index cards rather than a rigid grid — alternates a few fixed angles
// instead of anything random (random would re-roll on every re-render).
const CARD_TILTS = [-2.4, 1.8, -1.2, 2.2, -1.8, 1.2];

function checkpointY(index: number) {
    return index * CHECKPOINT_GAP_Y;
}

function stringEdge(id: string, source: string, target: string): Edge {
    return {
        id,
        source,
        target,
        type: "default",
        style: {
            stroke: "var(--color-blood)",
            strokeWidth: 2,
            opacity: 0.75,
        },
    };
}

function severityTone(severity: number) {
    const level = Math.max(1, Math.min(5, Number(severity) || 1));
    return [
        { pin: "var(--color-moss)", label: "minor" },
        { pin: "#9aa84f", label: "notable" },
        { pin: "var(--color-brass)", label: "serious" },
        { pin: "var(--color-rust)", label: "severe" },
        { pin: "var(--color-blood)", label: "critical" },
    ][level - 1];
}

function matchScore(
    failure: FailureMode,
    checkpoint: string,
    risk: CriticalRisk,
): number {
    const sourceDescription = risk.source_failure_description?.toLowerCase();
    const description = failure.description.toLowerCase();
    if (sourceDescription && description === sourceDescription) return 10_000;
    if (
        sourceDescription &&
        (description.includes(sourceDescription) ||
            sourceDescription.includes(description))
    )
        return 5_000;

    const riskWords = new Set(
        risk.description.toLowerCase().match(/[a-z0-9]{4,}/g) ?? [],
    );
    const overlap = (description.match(/[a-z0-9]{4,}/g) ?? []).filter((word) =>
        riskWords.has(word),
    ).length;
    return overlap + (risk.source_checkpoint === checkpoint ? 1 : 0);
}

function findBestMatch(
    results: CheckpointResult[],
    criticalRisk: CriticalRisk,
): { checkpointIndex: number; failureIndex: number } | null {
    let best: { checkpointIndex: number; failureIndex: number } | null = null;
    let bestScore = -Infinity;
    results.forEach((result, checkpointIndex) => {
        result.failures.forEach((failure, failureIndex) => {
            const score = matchScore(failure, result.checkpoint, criticalRisk);
            if (score > bestScore) {
                bestScore = score;
                best = { checkpointIndex, failureIndex };
            }
        });
    });
    return best;
}

// ---- Pure derivation: (plan, results, criticalRisk) -> (nodes, edges) --
// This is the only place layout math happens. Nothing else in the
// component mutates nodes/edges by hand, so there's no way for the graph
// to drift out of sync with the underlying data.
function buildGraph(
    plan: string,
    results: CheckpointResult[],
    criticalRisk: CriticalRisk | null,
    onReveal: (failure: FailureNodeData) => void,
): { nodes: Node[]; edges: Edge[] } {
    const nodes: Node[] = [
        {
            id: "plan",
            type: "plan",
            position: { x: PLAN_X, y: PLAN_Y },
            data: { plan } satisfies PlanNodeData,
            draggable: false,
            selectable: false,
        },
    ];
    const edges: Edge[] = [];

    // Find the single failure card that best matches the critical risk, so
    // we can highlight it and anchor the callout near it.
    const bestMatch = criticalRisk
        ? findBestMatch(results, criticalRisk)
        : null;

    CHECKPOINTS.forEach((name, checkpointIndex) => {
        const checkpointId = `checkpoint-${checkpointIndex}`;
        const result = results[checkpointIndex];
        const status: CheckpointStatus = result?.status ?? "queued";
        const y = checkpointY(checkpointIndex);

        nodes.push({
            id: checkpointId,
            type: "checkpoint",
            position: { x: CHECKPOINT_X, y },
            data: { name, status } satisfies CheckpointNodeData,
            targetPosition: Position.Left,
            sourcePosition: Position.Right,
            draggable: false,
            selectable: false,
        });
        edges.push(stringEdge(`plan-${checkpointId}`, "plan", checkpointId));

        const failures = result?.failures ?? [];
        if (failures.length > 0) {
            const startOffset = -((failures.length - 1) * FAILURE_ROW_STEP) / 2;
            failures.forEach((failure, failureIndex) => {
                const failureId = `${checkpointId}-failure-${failureIndex}`;
                nodes.push({
                    id: failureId,
                    type: "failure",
                    position: {
                        x: FAILURE_X,
                        y: y + startOffset + failureIndex * FAILURE_ROW_STEP,
                    },
                    data: {
                        ...failure,
                        checkpoint: name,
                        isCritical:
                            bestMatch?.checkpointIndex === checkpointIndex &&
                            bestMatch?.failureIndex === failureIndex,
                        onReveal,
                    } satisfies FailureNodeData,
                });
                edges.push(
                    stringEdge(
                        `${checkpointId}-failure-edge-${failureIndex}`,
                        checkpointId,
                        failureId,
                    ),
                );
            });
        } else if (status === "analyzing") {
            // A lightweight placeholder — this checkpoint's failure modes
            // haven't streamed in yet.
            nodes.push({
                id: `${checkpointId}-pending`,
                type: "pending",
                position: { x: FAILURE_X, y },
                data: {},
                draggable: false,
                selectable: false,
            });
        }
    });

    if (criticalRisk) {
        const anchorY = bestMatch
            ? checkpointY(bestMatch.checkpointIndex)
            : PLAN_Y;
        nodes.push({
            id: "critical-risk-callout",
            type: "criticalCallout",
            position: { x: CALLOUT_X, y: anchorY },
            data: criticalRisk,
            draggable: false,
            selectable: false,
        });
    }

    return { nodes, edges };
}

function createLoadingState(): CheckpointResult[] {
    return CHECKPOINTS.map((checkpoint, index) => ({
        checkpoint,
        status: index === 0 ? "analyzing" : "queued",
        failures: [],
    }));
}

// ---- Node renderers -------------------------------------------------------
// Every node below returns a React-Flow-managed OUTER wrapper (implicit,
// added by the library) containing exactly one element we style. Rotation,
// animation, and hover transforms are applied to that inner element only —
// never to the node's own `className`/`style` on the Node object — so they
// can never collide with React Flow's own positioning transform.

function PlanNode({ data }: NodeProps<Node<PlanNodeData>>) {
    const firstLine = data.plan.split("\n")[0] || data.plan;
    return (
        <article
            title={data.plan}
            className="animate-pin-in relative w-60 rounded-[2px] border border-[var(--color-brass-deep)]/50 bg-[var(--color-parchment)] px-5 py-4 text-[var(--color-ink)] shadow-[0_10px_24px_rgba(0,0,0,0.45)]"
            style={{ "--card-tilt": "-1.4deg" } as React.CSSProperties}
        >
            <Handle
                type="source"
                position={Position.Right}
                style={{ background: "var(--color-brass-deep)" }}
            />
            <span className="absolute -top-2 left-4 rotate-[-3deg] rounded-sm border border-[var(--color-blood-deep)] bg-[var(--color-blood)] px-2 py-0.5 font-[var(--font-type)] text-[0.58rem] uppercase tracking-[0.18em] text-[var(--color-parchment)] shadow-sm">
                Open case
            </span>
            <p className="mt-2 font-[var(--font-headline)] text-lg italic">
                Your plan
            </p>
            <p className="mt-1 truncate font-[var(--font-type)] text-xs text-[var(--color-ink-soft)]">
                {firstLine}
            </p>
        </article>
    );
}

function CheckpointNode({ data }: NodeProps<Node<CheckpointNodeData>>) {
    const statusLabel = {
        queued: "queued",
        analyzing: "analyzing…",
        complete: "complete",
        error: "unavailable",
    }[data.status];
    const isAnalyzing = data.status === "analyzing";
    const tone = {
        queued: "border-[var(--color-page-faint)]/40 text-[var(--color-page-faint)]",
        analyzing: "border-[var(--color-dusk)] text-[var(--color-dusk)]",
        complete: "border-[var(--color-moss)] text-[var(--color-moss)]",
        error: "border-[var(--color-rust)] text-[var(--color-rust)]",
    }[data.status];

    return (
        <div
            className={`relative w-44 rounded-[2px] border-l-4 bg-[var(--color-cork-deep)] px-4 py-3 shadow-[0_6px_16px_rgba(0,0,0,0.4)] ${tone}`}
        >
            <Handle
                type="target"
                position={Position.Left}
                style={{ background: "var(--color-brass-deep)" }}
            />
            <Handle
                type="source"
                position={Position.Right}
                style={{ background: "var(--color-brass-deep)" }}
            />
            <div className="font-[var(--font-headline)] text-base font-semibold text-[var(--color-page)]">
                {data.name}
            </div>
            <div className="mt-1 flex items-center gap-1.5 font-[var(--font-type)] text-[0.68rem] uppercase tracking-[0.14em]">
                {isAnalyzing && (
                    <span className="animate-lamp-pulse inline-block size-1.5 rounded-full bg-[var(--color-dusk)]" />
                )}
                {statusLabel}
            </div>
        </div>
    );
}

function FailureNode({ data }: NodeProps<Node<FailureNodeData>>) {
    const failure = data;
    const tone = severityTone(failure.severity);
    const tilt =
        CARD_TILTS[Math.abs(hash(failure.description)) % CARD_TILTS.length];

    return (
        <div
            role="button"
            tabIndex={0}
            onMouseEnter={() => failure.onReveal(failure)}
            onFocus={() => failure.onReveal(failure)}
            onClick={() => failure.onReveal(failure)}
            onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ")
                    failure.onReveal(failure);
            }}
            title={failure.description}
            style={
                {
                    width: FAILURE_CARD_WIDTH,
                    height: FAILURE_CARD_HEIGHT,
                    "--card-tilt": `${tilt}deg`,
                } as React.CSSProperties
            }
            className={`animate-pin-in group relative flex cursor-pointer flex-col justify-center overflow-hidden rounded-[2px] border p-4 pt-5 font-[var(--font-type)] text-[0.78rem] leading-snug text-[var(--color-ink)] shadow-[0_8px_18px_rgba(0,0,0,0.4)] outline-none transition-transform duration-150 hover:z-10 hover:-translate-y-1 hover:!rotate-0 focus:z-10 focus:-translate-y-1 focus:!rotate-0 focus:ring-2 focus:ring-[var(--color-brass)] ${
                failure.isCritical
                    ? "border-[var(--color-blood)] bg-[#fdeceb] ring-2 ring-[var(--color-blood)]/60"
                    : "border-[var(--color-ink-soft)]/25 bg-[var(--color-parchment)]"
            }`}
        >
            <Handle
                type="target"
                position={Position.Left}
                style={{ background: "var(--color-brass-deep)" }}
            />
            {/* pushpin */}
            <span
                className="absolute left-1/2 top-1.5 size-2.5 -translate-x-1/2 rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
                style={{ background: tone.pin }}
            />
            <span className="line-clamp-2">{failure.description}</span>
            <span
                className="mt-1.5 text-[0.6rem] uppercase tracking-[0.12em] opacity-60"
                style={{ color: tone.pin }}
            >
                {tone.label} · {failure.probability}
            </span>
        </div>
    );
}

function hash(value: string): number {
    let h = 0;
    for (let i = 0; i < value.length; i++) {
        h = (h << 5) - h + value.charCodeAt(i);
        h |= 0;
    }
    return h;
}

function PendingNode() {
    return (
        <div className="flex h-11 items-center gap-1.5 px-2 font-[var(--font-type)] text-[var(--color-page-faint)]">
            <span className="animate-lamp-pulse size-1.5 rounded-full bg-current" />
            <span className="text-lg leading-none">···</span>
        </div>
    );
}

function CriticalCallout({ data }: NodeProps<Node<CriticalRisk>>) {
    const risk = data;
    return (
        <aside
            className="animate-pin-in relative max-h-[420px] w-80 overflow-y-auto rounded-[2px] border-2 border-[var(--color-blood)] bg-[var(--color-parchment)] p-4 pt-6 font-[var(--font-type)] text-[0.8rem] leading-relaxed text-[var(--color-ink)] shadow-[0_14px_30px_rgba(0,0,0,0.5)]"
            style={{ "--card-tilt": "1.2deg" } as React.CSSProperties}
        >
            <Handle
                type="target"
                position={Position.Left}
                style={{ background: "var(--color-blood)" }}
            />
            <span className="absolute -top-3 -right-3 rotate-[8deg] rounded-sm border-2 border-[var(--color-blood)] bg-[var(--color-parchment)] px-2.5 py-1 font-[var(--font-headline)] text-[0.7rem] font-bold uppercase tracking-widest text-[var(--color-blood)]">
                Urgent
            </span>
            <p className="font-[var(--font-headline)] text-sm font-semibold italic text-[var(--color-blood)]">
                The one you missed
            </p>
            <p className="mt-2 font-semibold">{risk.description}</p>
            <p className="mt-2 text-[var(--color-ink-soft)]">
                <span className="font-semibold text-[var(--color-ink)]">
                    Why it slipped past:{" "}
                </span>
                {risk.why_overlooked}
            </p>
            <p className="mt-3 rounded-[2px] border border-[var(--color-ink-soft)]/20 bg-black/5 p-2 text-[var(--color-ink)]">
                <span className="font-semibold">Do this: </span>
                {risk.mitigation}
            </p>
        </aside>
    );
}

const nodeTypes = {
    plan: PlanNode,
    checkpoint: CheckpointNode,
    failure: FailureNode,
    pending: PendingNode,
    criticalCallout: CriticalCallout,
};

/** A React Flow view that progressively reveals results from POST /premortem. */
export function PremortemFlow({
    plan,
    model,
    endpoint = `${API_URL}:${API_PORT}${API_END_POINT}`,
}: PremortemFlowProps) {
    const [checkpointResults, setCheckpointResults] = useState<
        CheckpointResult[]
    >([]);
    const [criticalRisk, setCriticalRisk] = useState<CriticalRisk | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [streamError, setStreamError] = useState<string>();
    const [selectedFailure, setSelectedFailure] = useState<FailureNodeData>();
    const { fitView } = useReactFlow();

    const revealMitigation = useCallback((failure: FailureNodeData) => {
        setSelectedFailure(failure);
    }, []);

    // The graph is fully derived — no manual node/edge surgery, so it can
    // never drift out of sync with the underlying checkpoint data.
    const { nodes, edges } = useMemo(
        () =>
            buildGraph(plan, checkpointResults, criticalRisk, revealMitigation),
        [plan, checkpointResults, criticalRisk, revealMitigation],
    );

    // Each result changes the diagram bounds. Refit after React Flow has
    // measured the new cards, rather than leaving later branches off-screen.
    useEffect(() => {
        if (!nodes.length) return;
        const frame = window.requestAnimationFrame(() => {
            void fitView({ padding: 0.2, duration: 250, maxZoom: 1 });
        });
        return () => window.cancelAnimationFrame(frame);
    }, [fitView, nodes]);

    const revealCheckpoint = useCallback((result: CheckpointEvent) => {
        setCheckpointResults((current) => {
            const index = CHECKPOINTS.indexOf(result.checkpoint);
            if (index < 0) return current;

            const updated = [...current];
            updated[index] = {
                checkpoint: result.checkpoint,
                status: result.error ? "error" : "complete",
                failures: Array.isArray(result.failure_modes)
                    ? result.failure_modes.slice(0, 3)
                    : [],
            };
            if (index + 1 < CHECKPOINTS.length && !updated[index + 1]) {
                updated[index + 1] = {
                    checkpoint: CHECKPOINTS[index + 1],
                    status: "analyzing",
                    failures: [],
                };
            }
            return updated;
        });

        if (result.error) {
            setStreamError(`${result.checkpoint}: ${result.error}`);
        }
    }, []);

    const startPremortem = useCallback(async () => {
        if (!plan.trim() || isLoading) return;
        setCheckpointResults(createLoadingState());
        setCriticalRisk(null);
        setStreamError(undefined);
        setSelectedFailure(undefined);
        setIsLoading(true);

        try {
            // EventSource only supports GET. Fetch still consumes the backend's SSE framing
            // while allowing the required POST body.
            const response = await fetch(endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "text/event-stream",
                },
                body: JSON.stringify({ plan, model }),
            });
            if (!response.ok || !response.body)
                throw new Error(`Request failed (${response.status})`);

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            while (true) {
                const { done, value } = await reader.read();
                buffer += decoder.decode(value ?? new Uint8Array(), {
                    stream: !done,
                });
                const events = buffer.split(/\r?\n\r?\n/);
                buffer = events.pop() ?? "";
                for (const event of events) {
                    const eventType = event.match(/^event:\s*(.+)$/m)?.[1];
                    const data = event.match(/^data:\s*(.+)$/m)?.[1];
                    if (!data) continue;
                    if (eventType === "checkpoint")
                        revealCheckpoint(JSON.parse(data) as CheckpointEvent);
                    if (eventType === "critical_risk") {
                        const payload = JSON.parse(data) as {
                            critical_risk?: CriticalRisk | null;
                            error?: string;
                        };
                        if (payload.error)
                            setStreamError(`Critical risk: ${payload.error}`);
                        if (payload.critical_risk)
                            setCriticalRisk(payload.critical_risk);
                    }
                }
                if (done) break;
            }
        } catch (error) {
            setStreamError(
                error instanceof Error
                    ? error.message
                    : "Unable to stream the pre-mortem.",
            );
        } finally {
            setIsLoading(false);
        }
    }, [endpoint, isLoading, plan, revealCheckpoint]);

    return (
        <section>
            <div className="flex min-h-12 items-center gap-3">
                <button
                    type="button"
                    onClick={startPremortem}
                    disabled={isLoading || !plan.trim()}
                    className="rounded-sm border-2 border-[var(--color-blood-deep)] bg-[var(--color-blood)] px-5 py-2.5 font-[var(--font-headline)] text-sm font-semibold italic tracking-wide text-[var(--color-parchment)] shadow-[0_4px_0_var(--color-blood-deep)] transition hover:translate-y-0.5 hover:shadow-[0_2px_0_var(--color-blood-deep)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 disabled:hover:shadow-[0_4px_0_var(--color-blood-deep)]"
                >
                    {isLoading ? "Working the case…" : "Open investigation"}
                </button>
                {streamError && (
                    <span
                        role="status"
                        className="font-[var(--font-type)] text-sm text-[var(--color-rust)]"
                    >
                        {streamError}
                    </span>
                )}
            </div>
            <div className="bg-corkboard relative mt-4 h-[720px] overflow-hidden rounded-[3px] border-2 border-[var(--color-brass-deep)]/40 shadow-[inset_0_0_60px_rgba(0,0,0,0.55)]">
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={nodeTypes}
                    fitView
                    fitViewOptions={{ padding: 0.2 }}
                    minZoom={0.35}
                    proOptions={{ hideAttribution: true }}
                >
                    <Controls showInteractive={false} />
                </ReactFlow>
                {selectedFailure && (
                    <aside className="absolute bottom-4 left-4 z-10 max-w-sm rounded-[2px] border border-[var(--color-brass-deep)]/50 bg-[var(--color-parchment)]/97 p-4 font-[var(--font-type)] text-sm text-[var(--color-ink)] shadow-[0_16px_34px_rgba(0,0,0,0.55)] backdrop-blur">
                        <p className="text-[0.68rem] uppercase tracking-[0.2em] text-[var(--color-brass-deep)]">
                            Field notes
                        </p>
                        <p className="mt-1 font-[var(--font-headline)] text-base font-semibold not-italic">
                            {selectedFailure.description}
                        </p>
                        <p className="mt-2 flex gap-3 text-[0.68rem] uppercase tracking-[0.14em] text-[var(--color-ink-soft)]">
                            <span>Severity {selectedFailure.severity}/5</span>
                            <span>
                                {selectedFailure.probability} likelihood
                            </span>
                        </p>
                        <p className="mt-2 text-[var(--color-ink-soft)]">
                            {selectedFailure.mitigation}
                        </p>
                    </aside>
                )}
            </div>
        </section>
    );
}

export default function PremortemFlowWithProvider(props: PremortemFlowProps) {
    return (
        <ReactFlowProvider>
            <PremortemFlow {...props} />
        </ReactFlowProvider>
    );
}
