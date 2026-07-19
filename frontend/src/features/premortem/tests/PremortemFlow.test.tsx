import React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@xyflow/react", () => ({
    Controls: () => null,
    Handle: () => null,
    Position: { Left: "left", Right: "right" },
    ReactFlow: ({ children }: { children?: React.ReactNode }) => (
        <div>{children}</div>
    ),
    ReactFlowProvider: ({ children }: { children?: React.ReactNode }) => (
        <>{children}</>
    ),
    useReactFlow: () => ({ fitView: vi.fn() }),
}));

import { buildGraph } from "../lib/premortemGraph";

describe("buildGraph", () => {
    it("highlights the failure that best matches the critical risk", () => {
        const results = [
            {
                checkpoint: "Month 1",
                status: "complete" as const,
                failures: [
                    {
                        description: "API latency threatens onboarding",
                        probability: "high" as const,
                        severity: 4,
                        mitigation: "Add caching",
                    },
                    {
                        description: "Team lacks coverage",
                        probability: "medium" as const,
                        severity: 3,
                        mitigation: "Assign QA support",
                    },
                ],
            },
            {
                checkpoint: "Month 6",
                status: "complete" as const,
                failures: [
                    {
                        description: "Sales pipeline is too thin",
                        probability: "medium" as const,
                        severity: 2,
                        mitigation: "Expand outreach",
                    },
                ],
            },
            {
                checkpoint: "Year 1",
                status: "complete" as const,
                failures: [],
            },
        ];

        const criticalRisk = {
            description: "API latency can break the rollout",
            why_overlooked: "The team focused on launch timing",
            severity: 5,
            mitigation: "Introduce circuit breakers",
            source_checkpoint: "Month 1",
            source_failure_description: "API latency threatens onboarding",
        };

        const { nodes, edges } = buildGraph(
            "Ship the product",
            results,
            criticalRisk,
            vi.fn(),
        );

        expect(nodes[0].type).toBe("plan");
        expect(nodes.some((node) => node.id === "critical-risk-callout")).toBe(
            true,
        );
        const highlightedFailure = nodes.find(
            (node) => node.id === "checkpoint-0-failure-0",
        );
        expect(highlightedFailure?.data.isCritical).toBe(true);
        expect(edges).toHaveLength(6);
    });

    it("creates a pending node when a checkpoint has not streamed failures yet", () => {
        const { nodes } = buildGraph(
            "Launch the beta",
            [
                {
                    checkpoint: "Month 1",
                    status: "analyzing" as const,
                    failures: [],
                },
                {
                    checkpoint: "Month 6",
                    status: "queued" as const,
                    failures: [],
                },
                {
                    checkpoint: "Year 1",
                    status: "queued" as const,
                    failures: [],
                },
            ],
            null,
            vi.fn(),
        );

        expect(nodes.some((node) => node.id === "checkpoint-0-pending")).toBe(
            true,
        );
    });
});
