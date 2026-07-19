import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { API_URL, API_PORT } from "./src/config";

export default defineConfig({
    plugins: [react(), tailwindcss()],
    server: {
        proxy: {
            "/premortem": `${API_URL}:${API_PORT}`,
        },
    },
});
