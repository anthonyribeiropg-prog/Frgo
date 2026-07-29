import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
  // Tout le build est déposé à plat, sans sous-dossier assets/ : le site se
  // met en ligne par simple glisser-déposer des fichiers, sans qu'un dossier
  // puisse être oublié en route par l'interface d'envoi.
  build: { assetsDir: "." },
});
