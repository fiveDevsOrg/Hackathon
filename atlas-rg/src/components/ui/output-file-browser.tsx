import * as React from "react";
import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FileArchiveIcon,
  FileIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  GridIcon,
  HeadphonesIcon,
  ImageIcon,
  ListIcon,
  SearchIcon,
  SortAscIcon,
  SortDescIcon,
  VideoIcon,
} from "lucide-react";
import { AtlasScrollArea } from "@/components/ui/atlas-scroll-area";
import { FileCard, extensionToFormat } from "@/components/ui/file-card";
import { cn } from "@/lib/utils";

export type OutputBrowserFile = {
  id: string;
  name: string;
  kind?: string;
  mime?: string;
  type?: string;
  size?: number;
  url?: string;
  content?: string;
  outputName: string;
  outputStatus?: string;
  outputType?: string;
  createdAt?: string;
  output: unknown;
};

type OutputFileBrowserProps = {
  files: OutputBrowserFile[];
  onOpenFile: (file: OutputBrowserFile) => void;
};

type SortBy = "name" | "type" | "size" | "output" | "date";
type SortDir = "asc" | "desc";
type ViewMode = "list" | "grid";

export function formatBytes(bytes = 0, decimals = 2): string {
  if (!bytes) return "0 Bytes";
  const k = 1024;
  const dm = Math.max(0, decimals);
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function getExt(name: string) {
  const dot = name.lastIndexOf(".");
  return dot > -1 ? name.slice(dot + 1).toLowerCase() : "";
}

function niceSubtype(file: OutputBrowserFile) {
  const mime = file.mime || file.type || "";
  const ext = getExt(file.name);
  if (ext) return ext.toUpperCase();
  if (!mime) return "UNKNOWN";
  return (mime.split("/")[1] || mime.split("/")[0] || "unknown").toUpperCase();
}

function formatFileDate(value?: string) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fileIcon(file: OutputBrowserFile, className = "size-4 opacity-60") {
  const mime = file.mime || file.type || "";
  const ext = getExt(file.name);
  if (["pdf", "doc", "docx", "txt", "md"].includes(ext) || mime.includes("pdf") || mime.includes("word") || mime.includes("text")) {
    return <FileTextIcon className={className} aria-hidden="true" />;
  }
  if (["xls", "xlsx", "csv"].includes(ext) || mime.includes("spreadsheet") || mime.includes("excel")) {
    return <FileSpreadsheetIcon className={className} aria-hidden="true" />;
  }
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext) || mime.includes("archive") || mime.includes("zip")) {
    return <FileArchiveIcon className={className} aria-hidden="true" />;
  }
  if (mime.startsWith("video/") || ["mp4", "mov", "webm", "mkv"].includes(ext)) {
    return <VideoIcon className={className} aria-hidden="true" />;
  }
  if (mime.startsWith("audio/") || ["mp3", "wav", "flac", "m4a"].includes(ext)) {
    return <HeadphonesIcon className={className} aria-hidden="true" />;
  }
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) {
    return <ImageIcon className={className} aria-hidden="true" />;
  }
  return <FileIcon className={className} aria-hidden="true" />;
}

function BrowserButton({
  children,
  className,
  active,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      className={cn(
        "inline-flex h-8 items-center justify-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-zinc-300 disabled:cursor-not-allowed disabled:opacity-40",
        active ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
        className
      )}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}

export default function OutputFileBrowser({ files, onOpenFile }: OutputFileBrowserProps) {
  const [view, setView] = React.useState<ViewMode>("list");
  const [query, setQuery] = React.useState("");
  const [sortBy, setSortBy] = React.useState<SortBy>("name");
  const [sortDir, setSortDir] = React.useState<SortDir>("asc");
  const [copied, setCopied] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!copied) return undefined;
    const timeout = window.setTimeout(() => setCopied(null), 1200);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const totalSize = React.useMemo(() => files.reduce((sum, file) => sum + (file.size || 0), 0), [files]);
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? files.filter((file) => {
          const haystack = `${file.name} ${file.outputName} ${file.mime || ""} ${file.type || ""} ${getExt(file.name)}`.toLowerCase();
          return haystack.includes(q);
        })
      : files;
    return [...base].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "size") cmp = (a.size || 0) - (b.size || 0);
      else if (sortBy === "date") cmp = new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      else if (sortBy === "output") cmp = a.outputName.localeCompare(b.outputName);
      else if (sortBy === "type") cmp = niceSubtype(a).localeCompare(niceSubtype(b));
      else cmp = a.name.localeCompare(b.name);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [files, query, sortBy, sortDir]);

  async function copyLink(file: OutputBrowserFile) {
    const value = file.url || file.content || "";
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(file.id);
  }

  function downloadFile(file: OutputBrowserFile) {
    if (file.url) {
      window.open(file.url, "_blank", "noopener,noreferrer");
      return;
    }
    const blob = new Blob([file.content || ""], { type: file.mime || "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-medium text-zinc-950">
            Files <span className="text-zinc-500">({files.length})</span>
          </h3>
          <span className="text-xs text-zinc-500">Total: {formatBytes(totalSize)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search files..."
              className="h-8 w-56 rounded-md border border-zinc-200 bg-white px-7 text-[13px] outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
              aria-label="Search files"
            />
            <SearchIcon className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
          </div>
          <select
            className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-[13px] text-zinc-700 outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as SortBy)}
            aria-label="Sort files"
          >
            <option value="name">Name</option>
            <option value="type">Type</option>
            <option value="date">Date</option>
            <option value="size">Size</option>
            <option value="output">Output</option>
          </select>
          <BrowserButton className="w-8 px-0" onClick={() => setSortDir((dir) => (dir === "asc" ? "desc" : "asc"))} aria-label="Toggle sort direction">
            {sortDir === "asc" ? <SortAscIcon className="size-4" /> : <SortDescIcon className="size-4" />}
          </BrowserButton>
          <div className="flex items-center gap-1">
            <BrowserButton active={view === "list"} className="w-8 px-0" onClick={() => setView("list")} aria-label="List view">
              <ListIcon className="size-4" />
            </BrowserButton>
            <BrowserButton active={view === "grid"} className="w-8 px-0" onClick={() => setView("grid")} aria-label="Grid view">
              <GridIcon className="size-4" />
            </BrowserButton>
          </div>
        </div>
      </div>

      {filtered.length ? (
        view === "list" ? (
          <AtlasScrollArea className="max-h-[326px] rounded-md border border-zinc-200 bg-white">
            <table className="w-full table-fixed text-left text-[13px]">
              <thead className="sticky top-0 z-10 bg-zinc-50 text-xs text-zinc-500">
                <tr>
                  <th className="w-[52%] px-3 py-2 font-medium">Name</th>
                  <th className="w-[14%] px-3 py-2 font-medium">Type</th>
                  <th className="w-[22%] px-3 py-2 font-medium">Date</th>
                  <th className="w-[12%] px-3 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((file) => (
                  <tr className="border-t border-zinc-100 transition hover:bg-zinc-50" key={file.id}>
                    <td className="min-w-0 px-3 py-2">
                      <button className="flex max-w-full items-center gap-2 text-left font-medium text-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-300" type="button" onClick={() => onOpenFile(file)}>
                        <span className="shrink-0">{fileIcon(file)}</span>
                        <span className="truncate">{file.name}</span>
                      </button>
                      <div className="group relative mt-1 h-1.5 w-44 max-w-full overflow-visible">
                        <div
                          className="h-full overflow-hidden rounded bg-zinc-100"
                          title={formatBytes(file.size || 0)}
                          aria-label={`File size ${formatBytes(file.size || 0)}`}
                        >
                          <div className="h-full rounded bg-zinc-950/50" style={{ width: `${Math.min(100, Math.round(((file.size || 0) / Math.max(totalSize, 1)) * 100))}%` }} aria-hidden="true" />
                        </div>
                        <span className="pointer-events-none absolute left-0 top-2 z-20 hidden rounded-md bg-zinc-950 px-2 py-1 text-[11px] font-medium text-white shadow-lg group-hover:block">
                          {formatBytes(file.size || 0)}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-zinc-500">{niceSubtype(file)}</td>
                    <td className="px-3 py-2 text-zinc-500">{formatFileDate(file.createdAt)}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-0.5">
                        <IconAction label={`Open ${file.name}`} onClick={() => onOpenFile(file)}><ExternalLinkIcon className="size-4" /></IconAction>
                        <IconAction label={`Download ${file.name}`} onClick={() => downloadFile(file)}><DownloadIcon className="size-4" /></IconAction>
                        <IconAction label={`Copy ${file.name}`} onClick={() => copyLink(file)}>{copied === file.id ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}</IconAction>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AtlasScrollArea>
        ) : (
          <AtlasScrollArea className="max-h-[286px] rounded-md border border-zinc-200 bg-white" viewportClassName="p-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {filtered.map((file) => (
                <button
                  className="group flex min-w-0 flex-col overflow-hidden rounded-md border border-zinc-200 bg-white text-left transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-300"
                  key={file.id}
                  type="button"
                  onClick={() => onOpenFile(file)}
                >
                  <div className="flex h-32 w-full items-center justify-center bg-zinc-50">
                    <FileCard formatFile={extensionToFormat(file.name, file.mime || file.type || "")} />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1 p-2">
                    <div className="truncate text-[13px] font-medium text-zinc-950" title={file.name}>{file.name}</div>
                    <div className="truncate text-[12px] text-zinc-500">{niceSubtype(file)} · {formatBytes(file.size || 0)}</div>
                  </div>
                </button>
              ))}
            </div>
          </AtlasScrollArea>
        )
      ) : (
        <p className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-center text-sm text-zinc-500">No files match your search.</p>
      )}
    </div>
  );
}

function IconAction({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="inline-flex size-8 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-300"
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
