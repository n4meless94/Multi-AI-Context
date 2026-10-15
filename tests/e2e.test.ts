import { describe, it, expect } from "vitest"
import { execa } from "execa"
import path from "node:path"
import fs from "node:fs"
import os from "node:os"

describe("End-to-End CLI Integration", () => {
  it(
    "runs full handoff lifecycle and clean removal in an isolated repo",
    async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "handoff-e2e-"))
      
      // 1. Initialize git repo
      await execa("git", ["init"], { cwd: tempDir })
      fs.writeFileSync(path.join(tempDir, "README.md"), "# E2E Test Project\n", "utf8")
      await execa("git", ["add", "README.md"], { cwd: tempDir })
      await execa("git", ["commit", "-m", "initial commit"], { cwd: tempDir })

      // Create an uncommitted change
      fs.writeFileSync(path.join(tempDir, "service.ts"), "export const api = 1\n", "utf8")

      const cliPath = path.resolve("dist/cli.js")

      // 2. Run handoff with an explicit deeplink/session
      const res = await execa("node", [cliPath, "--cwd", tempDir, "--no-clipboard"])
      expect(res.exitCode).toBe(0)

      // 3. Test handoff clear command
      const clearRes = await execa("node", [cliPath, "clear", "--cwd", tempDir])
      expect(clearRes.exitCode).toBe(0)
      expect(clearRes.stdout).toContain("Repository state is clean")

      try {
        fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 3 })
      } catch {
        // ignore Windows file lock on temp git dir
      }
    },
    30000
  )
})
