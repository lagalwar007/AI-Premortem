import type { Edge, Node } from "@xyflow/react";

export type Probability = "low" | "medium" | "high";

export type FailureMode = {
    description: string;
    probability: Probability;
    severity: number;
    mitigation: string;
};

export type CheckpointStatus = "queued" | "analyzing" | "complete" | "error";

export type CheckpointResult = {
    checkpoint: string;
    status: CheckpointStatus;
    failures: FailureMode[];
};

export type CriticalRisk = {
    description: string;
    why_overlooked: string;
    severity: number;
    mitigation: string;
    source_checkpoint?: string;
    source_failure_description?: string;
};

export type FailureNodeData = FailureMode & {
    checkpoint: string;
    isCritical: boolean;
    onReveal: (failure: FailureNodeData) => void;
};

export type CheckpointNodeData = {
    name: string;
    status: CheckpointStatus;
};

export type PlanNodeData = {
    plan: string;
};

export const CHECKPOINTS = ["Month 1", "Month 6", "Year 1"];

const PLAN_X = 40;
const CHECKPOINT_X = 380;
const CHECKPOINT_GAP_Y = 420;
const FAILURE_X = CHECKPOINT_X + 420;
const FAILURE_CARD_WIDTH = 272;
const FAILURE_CARD_HEIGHT = 100;
const FAILURE_ROW_STEP = FAILURE_CARD_HEIGHT + 30;
const CALLOUT_X = FAILURE_X + FAILURE_CARD_WIDTH + 140;
const PLAN_Y = Math.floor((CHECKPOINTS.length - 1) / 2) * CHECKPOINT_GAP_Y;

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

export function buildGraph(
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
            targetPosition: "left" as never,
            sourcePosition: "right" as never,
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
