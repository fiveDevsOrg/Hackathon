import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type FormatFile =
  | "doc"
  | "pdf"
  | "md"
  | "mdx"
  | "csv"
  | "xls"
  | "xlsx"
  | "txt"
  | "ppt"
  | "pptx"
  | "zip"
  | "rar"
  | "tar"
  | "gz"
  | "code"
  | "html"
  | "js"
  | "jsx"
  | "tsx"
  | "css"
  | "json"
  | "img"
  | "png"
  | "jpg"
  | "jpeg"
  | "video";

type FileCardProps = {
  formatFile: FormatFile;
};

const PlaceholderLines = () => (
  <div className="space-y-1.5">
    <div className="flex gap-2">
      <div className="h-0.5 w-1/2 rounded-full bg-zinc-900/20" />
    </div>
    {Array.from({ length: 5 }).map((_, index) => (
      <div className="flex gap-1" key={index}>
        <div className="h-0.5 w-1/3 rounded-full bg-zinc-900/10" />
        {index < 4 && <div className="h-0.5 w-1/2 rounded-full bg-zinc-900/10" />}
      </div>
    ))}
  </div>
);

const colorBannerMap: Record<FormatFile, string> = {
  doc: "bg-blue-500 text-white",
  pdf: "bg-red-500 text-white",
  md: "bg-neutral-600 text-white",
  mdx: "bg-neutral-600 text-white",
  txt: "bg-gray-500 text-white",
  csv: "bg-teal-700 text-white",
  xls: "bg-emerald-600 text-white",
  xlsx: "bg-emerald-600 text-white",
  ppt: "bg-orange-500 text-white",
  pptx: "bg-orange-500 text-white",
  zip: "bg-purple-500 text-white",
  rar: "bg-purple-600 text-white",
  tar: "bg-yellow-600 text-white",
  gz: "bg-yellow-700 text-white",
  html: "bg-orange-600 text-white",
  js: "bg-yellow-600 text-white",
  jsx: "bg-blue-600 text-white",
  css: "bg-blue-600 text-white",
  json: "bg-yellow-500 text-white",
  tsx: "bg-blue-600 text-white",
  code: "bg-orange-600 text-white",
  img: "bg-pink-500 text-white",
  png: "bg-neutral-600 text-white",
  jpg: "bg-green-700 text-white",
  jpeg: "bg-green-700 text-white",
  video: "bg-green-700 text-white",
};

export function extensionToFormat(name = "", mime = ""): FormatFile {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (["doc", "pdf", "md", "mdx", "csv", "xls", "xlsx", "txt", "ppt", "pptx", "zip", "rar", "tar", "gz", "html", "js", "jsx", "tsx", "css", "json", "png", "jpg", "jpeg"].includes(ext)) {
    return ext as FormatFile;
  }
  if (mime.startsWith("image/")) return "img";
  if (mime.startsWith("video/")) return "video";
  if (mime.includes("spreadsheet") || mime.includes("excel")) return "xlsx";
  if (mime.includes("markdown")) return "md";
  if (mime.includes("json")) return "json";
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("word")) return "doc";
  if (mime.includes("zip") || mime.includes("archive")) return "zip";
  if (mime.includes("html") || mime.includes("javascript") || mime.includes("css")) return "code";
  return "txt";
}

export function FileCard({ formatFile }: FileCardProps) {
  const colorBannerClass = colorBannerMap[formatFile];
  let filePlaceholder: ReactNode = <PlaceholderLines />;

  if (formatFile === "md" || formatFile === "mdx") {
    filePlaceholder = (
      <div className="space-y-1.5">
        <div className="flex items-center gap-1">
          <div className="text-[10px] font-bold text-zinc-400">#</div>
          <div className="h-0.5 w-6 rounded-full bg-zinc-900/20" />
        </div>
        <PlaceholderLines />
      </div>
    );
  }

  if (formatFile === "xls" || formatFile === "xlsx" || formatFile === "csv") {
    filePlaceholder = (
      <div className="space-y-0.5">
        <div className="grid grid-cols-3 gap-0.5">
          {Array.from({ length: 3 }).map((_, index) => <div className="h-2 bg-zinc-900/20" key={index} />)}
        </div>
        <div className="grid grid-cols-3 gap-0.5">
          {Array.from({ length: 10 }).map((_, index) => <div className="h-2 bg-zinc-900/5" key={index} />)}
        </div>
      </div>
    );
  }

  if (["zip", "rar", "tar", "gz"].includes(formatFile)) {
    filePlaceholder = (
      <div className="flex h-full flex-col items-center justify-center">
        {Array.from({ length: 9 }).map((_, index) => (
          <div className="flex overflow-hidden rounded-full" key={index}>
            <div className={cn("size-1.5", index % 2 ? "bg-zinc-900/5" : "bg-zinc-900/20")} />
            <div className={cn("size-1.5", index % 2 ? "bg-zinc-900/20" : "bg-zinc-900/5")} />
          </div>
        ))}
      </div>
    );
  }

  if (["html", "js", "jsx", "tsx", "code", "css", "json"].includes(formatFile)) {
    filePlaceholder = (
      <div className="space-y-1">
        {Array.from({ length: 5 }).map((_, index) => (
          <div className={cn("flex items-center gap-0.5", index === 1 || index === 2 ? "pl-1" : "")} key={index}>
            <div className="font-mono text-[5px] text-zinc-400">{index === 2 ? "</" : "<"}</div>
            <div className={cn("h-0.75 rounded-full", index % 2 ? "w-2.5 bg-sky-400/60" : "w-3 bg-emerald-400/60")} />
            <div className="font-mono text-[5px] text-zinc-400">{index === 4 ? "/>" : ">"}</div>
          </div>
        ))}
      </div>
    );
  }

  if (["ppt", "pptx", "img", "png", "jpg", "jpeg", "video"].includes(formatFile)) {
    filePlaceholder = (
      <div className="space-y-1">
        <div className="rounded border bg-zinc-900/5 p-1">
          <div className="mx-auto size-3 rounded-sm bg-orange-400/40" />
          <div className="mx-auto mt-1 h-0.75 w-8 rounded-full bg-zinc-900/15" />
        </div>
        <div className="mx-auto h-0.75 w-6 rounded-full bg-zinc-900/15" />
      </div>
    );
  }

  return (
    <div aria-hidden className="relative size-fit">
      <div className={cn("absolute -right-2 bottom-1.5 z-2 rounded px-1.5 py-0.5 text-[8px] font-medium uppercase", colorBannerClass)}>
        {formatFile}
      </div>
      <div className="relative z-1 h-18 w-14 space-y-3 rounded-md bg-white p-2 ring-1 ring-zinc-200">
        {filePlaceholder}
      </div>
    </div>
  );
}

export default FileCard;
