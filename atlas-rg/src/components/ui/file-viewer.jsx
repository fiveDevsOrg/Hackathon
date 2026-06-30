import { Check, Copy, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AtlasScrollArea } from "@/components/ui/atlas-scroll-area";

function fileType(path = "") {
  const ext = path.split(".").pop()?.toUpperCase() || "TXT";
  return ext.length > 5 ? "TXT" : ext;
}

function iconFor(path = "") {
  const ext = path.split(".").pop()?.toLowerCase();
  if (["md", "txt"].includes(ext)) return "TXT";
  if (["json"].includes(ext)) return "{}";
  if (["csv", "xls", "xlsx"].includes(ext)) return "CSV";
  if (["doc", "docx"].includes(ext)) return "DOC";
  if (["js", "jsx", "ts", "tsx", "css", "html"].includes(ext)) return "</>";
  return "FILE";
}

function buildFileTree(files) {
  const root = {};
  for (const file of files) {
    const parts = String(file.path || file.name || "untitled.txt").split("/").filter(Boolean);
    let current = root;
    parts.forEach((part, index) => {
      if (!current[part]) {
        current[part] = index === parts.length - 1
          ? { id: parts.join("/"), name: part, file }
          : { id: parts.slice(0, index + 1).join("/"), name: part, children: {} };
      }
      current = current[part].children || current[part];
    });
  }

  const toArray = (node) => Object.values(node).map((item) => item.children
    ? { ...item, children: toArray(item.children) }
    : item);
  return toArray(root);
}

function FolderRow({ item, selectedPath, onSelect }) {
  const [open, setOpen] = useState(true);

  if (!item.children?.length) {
    return (
      <button
        className={`flex min-w-full w-max items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition focus:outline-none focus:ring-2 focus:ring-zinc-300 ${selectedPath === item.file.path ? "bg-white text-zinc-950 shadow-sm ring-1 ring-zinc-200" : "text-zinc-600 hover:bg-white/80"}`}
        type="button"
        onClick={() => onSelect(item.file.path)}
      >
        <span className="flex h-6 w-8 shrink-0 items-center justify-center rounded bg-zinc-100 font-mono text-[9px] font-semibold text-zinc-600 ring-1 ring-zinc-200">{iconFor(item.file.path)}</span>
        <span className="whitespace-nowrap">{item.name}</span>
      </button>
    );
  }

  return (
    <div className="min-w-full w-max">
      <button
        className="flex min-w-full w-max items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium text-zinc-700 transition hover:bg-white/80 focus:outline-none focus:ring-2 focus:ring-zinc-300"
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="w-3 shrink-0 text-zinc-400">{open ? "-" : "+"}</span>
        <span className="shrink-0 font-mono text-[10px] text-zinc-400">DIR</span>
        <span className="whitespace-nowrap">{item.name}</span>
      </button>
      {open && (
        <div className="ml-3 border-l border-zinc-200 pl-2">
          {item.children.map((child) => <FolderRow item={child} key={child.id} selectedPath={selectedPath} onSelect={onSelect} />)}
        </div>
      )}
    </div>
  );
}

function CodePane({ file }) {
  const content = file?.content || "";
  const isJson = file?.path?.toLowerCase().endsWith(".json");
  const isMarkdown = file?.path?.toLowerCase().endsWith(".md");
  const isCsv = file?.path?.toLowerCase().endsWith(".csv");

  return (
    <pre className={`min-h-full whitespace-pre rounded-none p-4 font-mono text-xs leading-relaxed ${isJson ? "bg-zinc-950 text-zinc-100" : isCsv ? "bg-white text-zinc-800" : isMarkdown ? "bg-zinc-50 text-zinc-800" : "bg-white text-zinc-800"}`}>
      {content || "No inline file content was provided. Use the external link when this artifact is stored as a downloadable file."}
    </pre>
  );
}

export default function ComponentFileViewer({ component, initialPath }) {
  const files = useMemo(() => (component?.files || []).filter(Boolean), [component]);
  const [selectedPath, setSelectedPath] = useState(initialPath || files[0]?.path);
  const [copied, setCopied] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const tree = useMemo(() => buildFileTree(files), [files]);
  const selected = files.find((file) => file.path === selectedPath) || files[0];

  useEffect(() => {
    if (initialPath && files.some((file) => file.path === initialPath)) {
      setSelectedPath(initialPath);
    } else if (!selectedPath && files[0]?.path) {
      setSelectedPath(files[0].path);
    }
  }, [files, initialPath, selectedPath]);

  async function copySelected() {
    if (!selected?.content) return;
    await navigator.clipboard.writeText(selected.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  if (!files.length) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-sm text-zinc-500">
        No files were included with this output.
      </div>
    );
  }

  return (
    <div
      className="grid min-h-[620px] overflow-hidden rounded-lg border border-zinc-200 bg-white"
      style={{ gridTemplateColumns: sidebarCollapsed ? "52px minmax(0,1fr)" : "280px minmax(0,1fr)" }}
    >
      <aside className="min-h-0 border-r border-zinc-200 bg-zinc-50/90">
        <div className={`flex items-center gap-2 border-b border-zinc-200 px-3 py-3 ${sidebarCollapsed ? "justify-center" : ""}`}>
          {!sidebarCollapsed && (
            <>
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white font-mono text-[10px] font-semibold text-zinc-700 ring-1 ring-zinc-200">DIR</span>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-zinc-950">{component?.name || "Files"}</div>
                <div className="truncate text-xs text-zinc-500">{component?.version || `${files.length} files`}</div>
              </div>
            </>
          )}
          <button
            className="ml-auto grid h-7 w-7 shrink-0 place-items-center rounded-md text-zinc-500 transition hover:bg-white hover:text-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-300"
            type="button"
            onClick={() => setSidebarCollapsed((value) => !value)}
            title={sidebarCollapsed ? "Expand file menu" : "Collapse file menu"}
            aria-label={sidebarCollapsed ? "Expand file menu" : "Collapse file menu"}
          >
            {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>
        {!sidebarCollapsed && (
          <AtlasScrollArea className="h-[calc(78vh-180px)]" viewportClassName="p-2">
            <div className="min-w-full w-max">
              {tree.map((item) => <FolderRow item={item} key={item.id} selectedPath={selected?.path} onSelect={setSelectedPath} />)}
            </div>
          </AtlasScrollArea>
        )}
      </aside>

      <section className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="rounded-full border border-zinc-200 px-2 py-0.5 font-mono text-[10px] font-semibold text-zinc-600">{fileType(selected?.path)}</span>
            <span className="min-w-0 truncate font-mono text-xs text-zinc-500">{selected?.path}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button className="grid h-8 w-8 place-items-center rounded-md text-zinc-600 transition hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-300 disabled:cursor-not-allowed disabled:opacity-40" type="button" onClick={copySelected} disabled={!selected?.content} title={copied ? "Copied" : "Copy file content"} aria-label={copied ? "Copied" : "Copy file content"}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
            {selected?.url && (
              <a className="rounded-md px-2 py-1 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-300" href={selected.url} target="_blank" rel="noreferrer">
                Open
              </a>
            )}
          </div>
        </div>
        <AtlasScrollArea className="min-h-0">
          <CodePane file={selected} />
        </AtlasScrollArea>
      </section>
    </div>
  );
}
