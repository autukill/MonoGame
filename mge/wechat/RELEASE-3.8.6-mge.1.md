# 3.8.6-mge.1 release gates (2026-10-24)

Frozen package source: 64cb55b90a0f4524378b3d241adc76ed0b3d87b8.
Upload artifact SHA256: 7d0bedfc36ba34fc4b2dcd3c8876cda98eee63dcef96401365f63188fdc3d86e
(5,789,162 bytes). NuGet repository signing may change the outer ZIP hash;
compare payload entries separately after public restore.

53 backend regression tests passed. Metadata comparison with official Native
3.8.6 found exactly 4,161 public/protected entries, no missing or added entries.
A negative resolved-reference test correctly rejects a foreign Native DLL.
An independent consumer outside the engine and backend repositories passed
first restore, LLVM AOT, strict native linking, package-owned export, ES2019
validation, GPU readback, SpriteBatch, touch press/release, SoundEffect/Song
start and natural end, exact stop cleanup, and reload using official WeChat CLI.

Monster consumer dfe80b62, fixed [3.8.6-mge.1], passed formal assembly/QA
isolation, menu/arsenal/equipment touch round trips, normal initial core
assembly, full first-world battle and return to news. The battle sample covered
47.7 seconds; observed 981 draws and 1,430 fixed updates (DevTools only).
Real SFX/music/VO paths were exercised, not silent placeholders. All four pinned
public resource archives were downloaded and hash verified; runtime warm cache
was separately accepted. Full dynamic outline fonts retain 5,618,420 bytes.
Stop drained persistence and released callbacks/listeners/audio/native contexts;
reload recovered the final committed profile checksum and revision.

The preceding Monster candidates 06c/07 are not full input acceptance: a
transitive audio reference selected official Native despite its equal assembly
name/version. Candidate 08 fixes the consumer reference and verifies restore
graph, actual DLL SHA256, and AOT response origin. Historical artifacts remain.

No phone preview was uploaded for this release task; physical audible output,
real OS lifecycle, Android/iOS acceptance and iOS performance are NOT_TESTED for
this new build. Earlier phone results belong to their original packages.
No interpreter, Gamma fallback, game code or diagnostic feature cuts are in the
backend. MyGameEngine/Monster policy and dynamic font engines remain external.
Evidence: wechat-backend-386-evidence/candidate-08-validation.json plus the
independent-08 and monster-08 records. Public feed receipt follows separately.
