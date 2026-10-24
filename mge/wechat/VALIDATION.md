# Local candidate validation (2026-10-24)

Candidate source 991521c0d. Package SHA256
`34262893cd94a96f141705dec1b31e826d5145d0316c43581fe081e166940183`; 5787412 bytes.
This is a local candidate, not a public release.

- 51 generic regression tests passed: input, oriented safe area, visibility,
  immutable package directories and aliases, persistent file transactions,
  PCM conversion, audio lifecycle, file music and late-callback cleanup.
- A copied sample outside both repositories restored only the fixed backend
  package and LLVM compiler packages, compiled net10.0 using .NET 11 RC2,
  linked native archives with undefined symbols forbidden, and exported
  ES2019 code using package-owned tools. No engine or game ProjectReference.
- Official WeChat CLI/automation: entry, GPU readback and SpriteBatch passed;
  TouchPanel observed one press/release. One SoundEffect and one Song each
  started and ended without failure. Stop completed with zero callbacks,
  listeners, audio buffers/voices/file contexts and filesystem caches;
  the global bridge was removed. Simulator refresh was requested afterward.
- These tests did not use computer-use or upload a phone preview. Actual
  audible output, phone lifecycle, consumer public API comparison and Monster
  integration remain pending. No public NuGet upload or git push occurred.

Evidence is preserved under the task's wechat-backend-386-evidence directory:
`candidate-04-validation.json`, `independent-04-start-touch.json`,
`independent-04-stop.json`, and owned *-process.json records. Earlier failed
candidates remain separate, including first-restore and export corrections.

Framework changes are confined to the WeChat project and target-specific
managed overlays. Original official Native/desktop/Android source files and
installed official package binaries were not overwritten. The public MonoGame
API is intended to remain compatible; supported platform behavior differs.
