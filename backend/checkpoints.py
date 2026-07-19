"""Timeline checkpoints and prompts for plan pre-mortems."""

from __future__ import annotations


CHECKPOINTS = ("Month 1", "Month 6", "Year 1")


def build_checkpoint_prompt(plan: str, prior_failures: str) -> str:
    """Build a Claude prompt for checkpoint-specific failure analysis.

    ``plan`` is the plan being assessed. ``prior_failures`` should contain any
    failures or risks already identified, so the analysis can build on them
    instead of repeating them.
    """
    return f"""You are conducting a practical pre-mortem for the plan below.

For each of these timeline checkpoints: Month 1, Month 6, and Year 1,
identify 2-3 plausible ways the plan could have failed or be materially off
track by that point.

Ground every failure mode in concrete details from the actual plan text:
its assumptions, dependencies, milestones, users, resources, sequencing, or
metrics. Do not give generic boilerplate such as \"poor communication,\"
\"lack of resources,\" or \"market changes\" unless you tie it directly to a
specific element of this plan. Consider the prior failures below, but do not
merely repeat them; use them as context to find additional or more precise
risks.

For every failure mode, provide:
- Description: a specific, concise explanation of what failed and why.
- Probability estimate: low, medium, or high.
- Severity: an integer from 1 (minor) to 5 (critical).
- Mitigation: one concrete sentence describing an action that would reduce
  the risk.

Format the response under headings for Month 1, Month 6, and Year 1, with
2-3 numbered failure modes under each heading. Do not invent plan details
that are not supported by the supplied text; if the plan lacks a needed
detail, state the resulting uncertainty precisely.

PLAN:
{plan}

PRIOR FAILURES OR RISKS:
{prior_failures}
"""
