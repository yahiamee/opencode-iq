import { performance } from "node:perf_hooks";
import { scan } from "../src/scan.js";
import { coverage } from "../src/knowledge.js";

const root = process.argv[2] ?? process.cwd();
const time = async (work) => {
  const start = performance.now();
  const result = await work();
  return [result, Number((performance.now() - start).toFixed(2))];
};
const [cold, coldMs] = await time(() => scan(root));
const [warm, warmMs] = await time(() => scan(root, cold.files));
const [metrics, coverageMs] = await time(() => coverage(warm, []));
console.log(JSON.stringify({
  files: Object.keys(warm.files).length,
  units: metrics.units.length,
  lines: metrics.totalLines,
  coldMs,
  warmMs,
  coverageMs,
  warmParses: warm.parsed,
  warmReuse: warm.reused,
}, null, 2));
