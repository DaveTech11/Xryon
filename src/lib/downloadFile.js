// Saves text as a file in the browser (no server round-trip).
export function downloadTextFile(path = "file.txt", text = "") {
  const name = path.split("/").pop() || "file.txt";
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Zip name from the shared top-level folder (e.g. "my-bot/src/a.js" -> "my-bot.zip").
export function zipNameFor(paths = []) {
  const roots = new Set(paths.map((p) => p.replace(/^\/+/, "").split("/")[0]));
  const multi = paths.every((p) => p.replace(/^\/+/, "").includes("/"));
  return roots.size === 1 && multi ? `${[...roots][0]}.zip` : "xyron-project.zip";
}
