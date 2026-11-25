const colors = { mastered: "#137333", partial: "#765700", insufficient: "#b42318", unassessed: "#565c64", reassessment: "#175cd3" };
const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export function htmlReport(metrics) {
  const columns = Object.keys(metrics.lines);
  const units = Map.groupBy(metrics.units, (unit) => unit.file);
  const rows = metrics.files.map(({ file, language, analysis, lines, statuses }) => {
    const details = (units.get(file) ?? []).map(({ id, start, end, status, kind }) => (
      `<li><code>${escape(id)}</code> · ${escape(kind)} · lines ${start}–${end} · <span class="${status}">${status}</span></li>`
    ));
    const matching = columns.filter((name) => statuses[name] > 0).join(" ");
    return `<tr data-file="${escape(file)}" data-status="${matching}"><th scope="row"><details><summary>${escape(file)}</summary><ul>${details.join("")}</ul></details></th><td>${escape(language)} (${escape(analysis)})</td><td>${lines}</td>${columns.map((name) => `<td>${statuses[name]}</td>`).join("")}</tr>`;
  });
  const percent = (ratio) => Number.isFinite(ratio) ? `${(100 * ratio).toFixed(1)}%` : "No evidence";
  return `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OpenCode IQ coverage</title>
<style>
  :root{color-scheme:light dark}body{font:1rem system-ui;margin:2rem;line-height:1.5}table{border-collapse:collapse;width:100%}
  th,td{border-bottom:1px solid #888;padding:.6rem;text-align:left;vertical-align:top}label{margin-inline-end:1rem}
  summary{cursor:pointer}ul{padding-inline-start:1.5rem}input,select{font:inherit}code{overflow-wrap:anywhere}
  .scroll{overflow:auto}${columns.map((name) => `.${name}{color:${colors[name]};font-weight:700}@media(prefers-color-scheme:dark){.${name}{color:inherit}}`).join("")}
</style>
<main><h1>Code understanding coverage</h1>
<p>${metrics.totalLines} eligible source lines · ${percent(metrics.masteryCoverage)} mastered · ${percent(metrics.assessmentCoverage)} of units assessed</p>
<label>File name <input type="search" id="query" autocomplete="off"></label>
<label>Status <select id="status"><option value="">All statuses</option>${columns.map((name) => `<option>${name}</option>`).join("")}</select></label>
<p id="count" aria-live="polite">${rows.length} files</p>
<div class="scroll"><table><thead><tr><th scope="col">File and units</th><th scope="col">Language</th><th scope="col">Lines</th>${columns.map((name) => `<th class="${name}" scope="col">${name}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div></main>
<script>
  const query = document.querySelector('#query');
  const status = document.querySelector('#status');
  const count = document.querySelector('#count');
  const rows = document.querySelectorAll('tbody tr');
  function filter() {
    let visible = 0;
    for (const row of rows) {
      row.hidden = !row.dataset.file.toLowerCase().includes(query.value.trim().toLowerCase()) ||
        (status.value !== '' && !row.dataset.status.split(' ').includes(status.value));
      if (!row.hidden) visible++;
    }
    count.textContent = visible + ' of ' + rows.length + ' files';
  }
  query.addEventListener('input', filter);
  status.addEventListener('change', filter);
</script></html>`;
}
