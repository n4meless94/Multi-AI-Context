import { describe, it, expect } from "vitest"
import { copyToClipboard } from "../src/utils/clipboard.js"

describe("Clipboard Utility", () => {
  it("copies text without throwing error", async () => {
    const success = await copyToClipboard("Handoff clipboard test prompt")
    expect(typeof success).toBe("boolean")
  })
})
