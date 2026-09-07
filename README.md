# DAT Field Reorder — strict FE/DC4

Current file: `field_mapper.html`  (the shipped filename is FIXED — versioning is internal only)  
Internal version: `2.18.5` — Build: `2026-09-06-h7` — **Release Candidate**

Local browser tool for reordering/removing DAT columns, mapping client headers, and comparing saved output with the original. File contents stay in the browser. Chrome/Edge with File System Access supports streaming saves; other save paths accumulate a Blob in memory.

## Supported integrity policy

- Fully þ-qualified FE/DC4 records; U+0014 separates columns.
- UTF-8 and UTF-16 LE/BE, with or without BOM. Malformed Unicode is blocked; encoding detection is heuristic for BOM-less files.
- Existing strict restrictions remain: ambiguous legacy no-DC4 records, literal þ/DC4 or raw CR/LF within values, CP1252, leading blank lines, mixed record EOL, and short/long rows are blocked for delivery.
- Every client output field needs a source mapping. Duplicate output headers are blocked. Mapping reuse can intentionally copy one source column into several client columns.
- Nonempty destinations are never overwritten. An unreadable destination is blocked. Save to a new name.
- Save checks row structure/count before close, then re-reads the header and ALL output bytes. SHA-256 is mandatory even when the optional audit report is unchecked. Failures do not qualify as usable saved output.
- Each analyzed file gets a full-byte SHA-256 fingerprint. Saves and validation must match those analyzed bytes, including changes in removed columns. Actual BOM bytes are checked and hashed. Final-EOL state comes from the full scan, with no error-suppressing tail probe.
- Saved-output validation reopens the destination handle instead of trusting an older File snapshot. Re-parsing uses the same source-load transaction, and a failed replacement cannot retain the previous source.
- Multi-row pasted maps must contain exactly two meaningful columns: original and output. Blank output headers and inconsistent widths are rejected. Only explicit, recognized title pairs are skipped. A single-row renamed map is supported in Validator.
- Operation errors remain visible and can be downloaded as local JSON. The latest 100 errors are retained with total/omitted counts; unknown record identities and positions are reported as null. Snippets and error messages are bounded. Reports can include filenames and should be handled accordingly.
- Source encoding, BOM, record EOL and final-EOL presence are preserved. Parsed field values are not cleansed or normalized.
- v2.18.2 additions: pasted client headers are preserved VERBATIM (no implicit trim; T1 Exact is whitespace/case exact, folding is confined to T2); the row-width histogram detail is bounded while matching/mismatching totals stay exact; save cleanup failures are reported; a local-only CSP is embedded.
- v2.18.3 additions: real cooperative Validator cancellation; operation locks always recover after cancellation/supersession; source/output concurrent load busy ownership; explicit operator approval for the selected identity and all T2 normalized-name mappings; 1-Click saved validation seeds mapping but never auto-starts; blank pasted rows/columns and extra empty Excel columns are blocked rather than discarded; Validator vertical-map whitespace is preserved.
- v2.18.4 RC: pasted Validator maps record `manual-exact` versus normalized `T2` provenance truthfully. Normalized mappings require T2 approval, and output columns omitted from a pasted map remain unresolved rather than being silently auto-filled.
- v2.18.5 RC: bilingual owner watermark update; HTML/internal/documentation version metadata synchronized. No DAT transformation contract change.
- One record is limited to 64Mi UTF-16 code units and 2,000 columns, including output after field reuse. The 2,000-column limit is checked before `split()` allocation and avoids creating unsafe 10,000-row DOM workspaces. Blob output is limited to 512MiB; streaming disk save is required above that. Practical memory limits can be lower.

## Delivery workflow

1. Open the HTML in the intended browser. Confirm the startup core/hash self-tests pass.
2. Load the original DAT. Review detected encoding, header names, record counts and structural findings.
3. Review the output column plan against the approved delivery specification. Check automatic matches manually where names have similar spellings or different meanings.
4. Save to a NEW destination and wait for byte verification to finish. Retain the optional audit report with its source/output hashes and mapping snapshot.
5. Run the Validator with the approved record identity field. Explicitly approve the selected identity and any T2 normalized-name links. For streaming saves, the saved-output button seeds the mapping but does not start validation. For Blob downloads, explicitly select the downloaded disk file.
6. Review the completed parsed-value result and identity QC. Keep that report and the final delivery hash. A successful save alone does not establish semantic mapping correctness.

The duplicate identity scan is advisory and capped at 500,000 distinct identities. PASS is a parsed-value result for the selected mapping, not a guarantee that identity is globally unique or that the delivery specification was interpreted correctly.

## Tests

Node.js >=20, no dependencies:

```powershell
node tests/run_core_tests.mjs
node tests/run_dom_flow.mjs
```

Verified on Node v24.19.0 for the current v2.18.5/h7 RC: the core suite passes **20 hardened groups** (including 5,000 randomized Unicode round-trips) plus **4 strict-profile fixture groups**; the DOM/save/validator integration harness passes **39 groups**. Zero failures.

- `tests/run_core_tests.mjs` runs `tests/hardened_tests.mjs` (streaming/encoding/hash/sink/validator-pair core groups, including 5,000 randomized Unicode round-trips) plus `tests/strict_fixture_tests.mjs` (strict-policy fixtures) and the current hardening regressions.
- `tests/run_dom_flow.mjs` evaluates the complete inline script with mocked DOM/File System Access: both save paths, re-read validation, stale-state invalidation, cancellation/approval/load-race handling, and local-only guards.
- `tests/fixtures.mjs` is the strict-profile fixture data consumed by `strict_fixture_tests.mjs`.

The supplied `saltvpepper.dat` indexes as UTF-8 FE/DC4, 28 columns and 688 data rows, with no parse/width/mixed-EOL errors. It was not modified.

## Real-browser acceptance still required

Before production rollout, open this build in the exact browser/environment used by operators. With non-sensitive representative fixtures, check file selection, picker cancellation, both save modes, byte verification, report download and saved-file validation. Confirm that selecting an existing nonempty destination is blocked. Exercise large files and the actual destination storage used by the team.

These OS/browser interactions and forced process termination are not executed by the automated mock harness. The File System Access re-read verifies the closed destination handle byte-for-byte; it does not provide fsync() or atomic-replace durability. A file that fails post-close verification can remain on disk: do not deliver it.

See [DATA_INTEGRITY_REVIEW.md](DATA_INTEGRITY_REVIEW.md) for findings, fixes, evidence and remaining operational limits.
