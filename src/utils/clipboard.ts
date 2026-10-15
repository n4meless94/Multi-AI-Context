import { execa } from "execa"
import os from "node:os"

export async function copyToClipboard(text: string): Promise<boolean> {
  const platform = os.platform()

  try {
    if (platform === "win32") {
      // Use PowerShell Set-Clipboard with standard input
      await execa("powershell", ["-NoProfile", "-Command", "$input | Set-Clipboard"], {
        input: text,
      })
      return true
    } else if (platform === "darwin") {
      await execa("pbcopy", { input: text })
      return true
    } else {
      // Linux / WSL: try wl-copy or xclip
      try {
        await execa("wl-copy", { input: text })
        return true
      } catch {
        await execa("xclip", ["-selection", "clipboard"], { input: text })
        return true
      }
    }
  } catch {
    return false
  }
}
