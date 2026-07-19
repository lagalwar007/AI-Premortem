import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./PremortemFlow", () => ({
    default: () => <div data-testid="premortem-flow" />,
}));

import { ThemeToggle } from "./App";

describe("ThemeToggle", () => {
    it("renders the toggle button with the expected accessibility label", () => {
        const markup = renderToStaticMarkup(
            <ThemeToggle theme="dark" onToggle={() => {}} />,
        );

        expect(markup).toContain('aria-label="Switch to light mode"');
        expect(markup).toContain('type="button"');
    });
});
