import { defineConfig } from "vite";
import { readFile } from "node:fs/promises";

// Optional local research seed. It is never copied into the production build.
export default defineConfig({
  build: { rollupOptions: { input: "dev.html" } },
  plugins: [
    {
      name: "standard-build-entry",
      generateBundle: {
        order: "post",
        handler(_options, bundle) {
          if (bundle["dev.html"]) {
            bundle["dev.html"].fileName = "index.html";
            bundle["index.html"] = bundle["dev.html"];
            delete bundle["dev.html"];
          }
        },
      },
    },
    {
      name: "local-family-data",
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.method === "GET" && req.url?.split("?")[0] === "/") {
            req.url = "/dev.html" + req.url.slice(1);
          }
          next();
        });
        server.middlewares.use("/api/family", async (req, res) => {
          if (req.method !== "GET") {
            res.statusCode = 405;
            res.end();
            return;
          }
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          if (!process.env.GENEALOGY_DATA_FILE) {
            res.end(
              JSON.stringify({
                version: 1,
                title: "Môj rodokmeň",
                people: [],
                relationships: [],
                questions: [],
              }),
            );
            return;
          }
          try {
            res.end(await readFile(process.env.GENEALOGY_DATA_FILE, "utf8"));
          } catch {
            res.statusCode = 500;
            res.end(
              JSON.stringify({ error: "Rodinný súbor sa nepodarilo načítať." }),
            );
          }
        });
      },
    },
  ],
});
