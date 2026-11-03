import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../", import.meta.url));
export function loadTestModule(relativePath, { mocks = {}, env = {}, fetch = () => { throw new Error("Unexpected network call in test"); } } = {}) {
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const compiled = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const localRequire = (name) => {
      if (name in mocks) return mocks[name];
      if (!name.startsWith(".")) return require(name);
      return load(path.resolve(path.dirname(filename), name + (path.extname(name) ? "" : ".ts")));
    };
    new Function("require", "module", "exports", "process", "fetch", compiled)(localRequire, module, module.exports, { env }, fetch);
    return module.exports;
  }
  return load(path.resolve(root, relativePath));
}
