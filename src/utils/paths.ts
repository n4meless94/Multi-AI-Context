import path from "node:path"
import os from "node:os"

export function normalizePath(inputPath: string): string {
  if (!inputPath) return ""
  let normalized = path.resolve(inputPath).replace(/\\/g, "/")
  if (os.platform() === "win32") {
    // Normalize Windows drive letter: C:/ -> c:/
    normalized = normalized.replace(/^([A-Za-z]):/, (_, drive) => drive.toLowerCase() + ":")
  }
  // Remove trailing slashes
  return normalized.replace(/\/+$/, "")
}

export function pathsEqual(p1: string, p2: string): boolean {
  return normalizePath(p1) === normalizePath(p2)
}

export function slugifyForCommandCode(inputPath: string): string {
  // e.g. C:\Work\QSB\QSB Intranet -> c-work-qsb-qsb-intranet
  const normalized = normalizePath(inputPath)
  return normalized
    .replace(/^([a-z]):/, "$1")
    .replace(/[^a-zA-Z0-9]/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase()
    .replace(/^-|-$/g, "")
}

export function slugifyForClaudeCode(inputPath: string): string {
  // e.g. C:\Work\QSB\QSB Intranet -> C--Work-QSB-QSB-Intranet
  // Claude Code replaces :\ with -- and spaces/slashes with -
  const resolved = path.resolve(inputPath)
  return resolved
    .replace(/:\\/g, "--")
    .replace(/:\//g, "--")
    .replace(/[\\/]/g, "-")
    .replace(/\s+/g, "-")
}
