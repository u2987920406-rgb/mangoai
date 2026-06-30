import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

function mangoClickSource() {
  // Stampe chaque élément hôte JSX avec data-mango-src="chemin/relatif:ligne"
  // (dev only) pour le relais clic->source de MangoOS. Inoffensif, idempotent.
  return function (babel) {
    var t = babel.types;
    return {
      name: "mango-click-source",
      visitor: {
        JSXOpeningElement: function (p, state) {
          var n = p.node.name;
          if (!n || n.type !== "JSXIdentifier" || !/^[a-z]/.test(n.name)) return;
          for (var i = 0; i < p.node.attributes.length; i++) {
            var a = p.node.attributes[i];
            if (a.type === "JSXAttribute" && a.name && a.name.name === "data-mango-src") return;
          }
          var loc = p.node.loc;
          if (!loc) return;
          var f = (state.file && state.file.opts && state.file.opts.filename) || "";
          var root = (state.file && state.file.opts && state.file.opts.root) || "";
          if (root && f.indexOf(root) === 0) f = f.slice(root.length);
          f = f.replace(/^[\\/]+/, "").replace(/\\/g, "/");
          p.node.attributes.push(
            t.jsxAttribute(t.jsxIdentifier("data-mango-src"), t.stringLiteral(f + ":" + loc.start.line))
          );
        }
      }
    };
  };
}

export default defineConfig({
  plugins: [react({ babel: { plugins: process.env.NODE_ENV === "production" ? [] : [mangoClickSource()] } }), tailwindcss()],
  server: {
    // The builder UI embeds this app in an iframe from another origin (localhost:5173)
    cors: true,
  },
});
