import { useEffect, useState } from "react";

import PremortemFlow from "./features/premortem/components/PremortemFlow";

type Theme = "dark" | "light";
const THEME_STORAGE_KEY = "premortem-theme";

function getInitialTheme(): Theme {
    if (typeof window === "undefined") return "dark";
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
    // Case files default to the lamp-lit dark room, but respect a light
    // preference if the OS/browser already says so.
    return window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark";
}

function SunIcon() {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
        >
            <circle cx="12" cy="12" r="4.2" />
            <path
                strokeLinecap="round"
                d="M12 2.5v2.4M12 19.1v2.4M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7"
            />
        </svg>
    );
}

function MoonIcon() {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
        >
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M20.2 14.7A8.4 8.4 0 1 1 9.3 3.8a6.7 6.7 0 0 0 10.9 10.9z"
            />
        </svg>
    );
}

export function ThemeToggle({
    theme,
    onToggle,
}: {
    theme: Theme;
    onToggle: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onToggle}
            className="theme-toggle"
            aria-label={
                theme === "dark"
                    ? "Switch to light mode"
                    : "Switch to dark mode"
            }
            title={
                theme === "dark"
                    ? "Switch to light mode"
                    : "Switch to dark mode"
            }
        >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
    );
}

const examplePlans = [
    {
        label: "AI payroll startup",
        plan: "Launch an AI payroll-compliance assistant for Indian startups. Interview 25 finance leads in month one, build an MVP for statutory filing checks by month three, secure 10 paid design partners by month six, and reach ₹30 lakh ARR by year one with a two-person engineering team.",
    },
    {
        label: "Neighbourhood marketplace",
        plan: "Build a hyperlocal marketplace that lets apartment residents buy surplus home-cooked meals from verified neighbours. Pilot in three Bengaluru communities in month one, add delivery partners by month six, and expand to 50 communities while achieving repeat weekly orders by year one.",
    },
    {
        label: "Move cities",
        plan: "Decide whether to relocate from Bengaluru to Pune for a new role. Use the first month to compare total compensation, housing, commute, and partner preferences; move after six months only if the role improves career growth and daily quality of life; reassess after one year using savings, social support, and job satisfaction.",
    },
    {
        label: "Career break",
        plan: "Take a six-month career break to prepare for a product-management transition. Build a six-month savings buffer, complete two portfolio projects in month one, interview monthly with mentors by month six, and target a product role within one year without exhausting the emergency fund.",
    },
    {
        label: "Monolith to services",
        plan: "Migrate a revenue-critical Django monolith to modular services. Map dependencies and define service boundaries in month one, move checkout and inventory behind stable APIs by month six with no increase in failed orders, and retire the old synchronous integration layer by year one while supporting 3x traffic.",
    },
    {
        label: "Cloud data migration",
        plan: "Move a regulated analytics platform from self-managed PostgreSQL to managed cloud data services. Validate data classification and recovery procedures in month one, run dual-write and reconciliation for six months, and cut over reporting workloads by year one without data loss, unacceptable query latency, or audit gaps.",
    },
];

const models = [
    {
        id: "llama-3.3-70b-versatile",
        label: "Groq — Llama 3.3 70B (free tier)",
    },
    { id: "llama-3.1-8b-instant", label: "Groq — Llama 3.1 8B (free tier)" },
];

export default function App() {
    const [plan, setPlan] = useState("");
    const [model, setModel] = useState(models[0].id);
    const [theme, setTheme] = useState<Theme>(getInitialTheme);

    useEffect(() => {
        document.documentElement.dataset.theme = theme;
        window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }, [theme]);

    return (
        <main className="bg-office min-h-screen px-4 py-10 text-[var(--color-page)] sm:px-10 3xl:px-16 4k:px-24">
            <div className="mx-auto max-w-7xl space-y-8 3xl:max-w-[1720px] 4k:max-w-[2200px]">
                <header className="animate-rise flex items-start justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 font-[var(--font-type)] text-[0.7rem] uppercase tracking-[0.32em] text-[var(--color-brass)]">
                            <span className="animate-lamp-pulse inline-block size-1.5 rounded-full bg-[var(--color-brass)]" />
                            Case file · open
                        </div>
                        <h1 className="text-glow-brass text-fluid-hero mt-3 font-[var(--font-headline)] italic tracking-tight text-[var(--color-page)]">
                            Pre-mortem
                        </h1>
                        <p className="mt-3 max-w-2xl font-[var(--font-type)] text-sm leading-relaxed text-[var(--color-page-dim)] 4k:text-base">
                            Pin the plan to the board. We'll work the timeline
                            forward and surface what's most likely to go wrong
                            before it does.
                        </p>
                    </div>
                    <ThemeToggle
                        theme={theme}
                        onToggle={() =>
                            setTheme((current) =>
                                current === "dark" ? "light" : "dark",
                            )
                        }
                    />
                </header>

                <section
                    aria-label="Example plans"
                    className="animate-rise"
                    style={{ animationDelay: "80ms" }}
                >
                    <p className="mb-2.5 font-[var(--font-type)] text-[0.68rem] uppercase tracking-[0.24em] text-[var(--color-page-faint)]">
                        Or pull a case from the file
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {examplePlans.map((example) => (
                            <button
                                key={example.label}
                                type="button"
                                onClick={() => setPlan(example.plan)}
                                className="rounded-sm border border-[var(--color-brass-deep)]/40 bg-[var(--color-cork-deep)] px-3.5 py-1.5 font-[var(--font-type)] text-xs text-[var(--color-page-dim)] transition hover:border-[var(--color-brass)] hover:text-[var(--color-brass)]"
                            >
                                {example.label}
                            </button>
                        ))}
                    </div>
                </section>

                <div
                    className="animate-rise grid gap-6 sm:grid-cols-[220px_1fr] 3xl:grid-cols-[280px_1fr]"
                    style={{ animationDelay: "140ms" }}
                >
                    <label className="block">
                        <span className="mb-2 block font-[var(--font-type)] text-[0.68rem] uppercase tracking-[0.24em] text-[var(--color-page-faint)]">
                            Analyst model
                        </span>
                        <select
                            value={model}
                            onChange={(event) => setModel(event.target.value)}
                            className="w-full rounded-sm border border-[var(--color-brass-deep)]/40 bg-[var(--color-parchment)] px-3 py-2.5 font-[var(--font-type)] text-sm text-[var(--color-ink)] shadow-sm outline-none transition focus:border-[var(--color-brass)] focus:ring-4 focus:ring-[var(--color-brass-wash)] 4k:py-3.5 4k:text-base"
                        >
                            {models.map((option) => (
                                <option key={option.id} value={option.id}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="block">
                        <span className="mb-2 block font-[var(--font-type)] text-[0.68rem] uppercase tracking-[0.24em] text-[var(--color-page-faint)]">
                            Plan under review
                        </span>
                        <textarea
                            value={plan}
                            onChange={(event) => setPlan(event.target.value)}
                            placeholder="Example: Launch a beta with 20 design partners by the end of Q1…"
                            className="min-h-32 w-full rounded-sm border border-[var(--color-brass-deep)]/40 bg-[var(--color-parchment)] p-4 font-[var(--font-type)] text-sm leading-relaxed text-[var(--color-ink)] shadow-sm outline-none transition placeholder:text-[var(--color-ink-soft)] focus:border-[var(--color-brass)] focus:ring-4 focus:ring-[var(--color-brass-wash)] 4k:min-h-40 4k:p-5 4k:text-base"
                        />
                    </label>
                </div>

                <div
                    className="animate-rise"
                    style={{ animationDelay: "200ms" }}
                >
                    <PremortemFlow plan={plan} model={model} />
                </div>
            </div>
        </main>
    );
}
