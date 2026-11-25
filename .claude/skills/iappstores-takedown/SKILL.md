---
name: iappstores-takedown
description: Submit a takedown request on iappstores.com/takedown on behalf of a rights holder (e.g. a brand-protection SOC notice about an app listing). Use when given a takedown/phishing/impersonation notice that cites an iappstores.com/apps/<slug> URL.
---

# iappstores takedown submission

The site has no public API: the form posts to a TanStack server function that Cloudflare only accepts from a real browser on the site. **Do not spoof Origin/Referer headers or call `/_serverFn/...` directly** — drive the public form with headless Playwright (`submit.js`).

## Steps
1. Extract from the notice: infringing URL(s) `https://iappstores.com/apps/<slug>` (un-defang `hXXps`), legitimate app URL (use as proof URL), detection date, client/brand name.
2. Confirm with the user: requester name, email (a confirmation email goes there — never use the user's own account email without approval), org, and reason. Reasons: `dmca`, `trademark`, `privacy`, `impersonation`, `other`. Notices that talk about "use of our client's mark" fit `trademark`/`impersonation` better than `dmca`; flag a mismatch.
3. Dry run, then submit (run from any dir; playwright is preinstalled, use `NODE_PATH=$(npm root -g)`):
   ```
   NODE_PATH=$(npm root -g) node ~/.claude/skills/iappstores-takedown/submit.js '{"name":"...","email":"...","org":"...","reason":"dmca","proof":"https://apps.apple.com/...","apps":["https://iappstores.com/apps/<slug>"]}' [--dry-run]
   ```
4. Report the `Reference ID`. The form has no field for the detection date or notice text; mention that in the summary.
5. Verify: `curl -sI https://iappstores.com/apps/<slug>` should become 404 ("App not found") after approval; the site is not Cloudflare-cached (DYNAMIC). Stale views are usually browser/search-engine caches.

## Notes
- Form fields: `#name #email #org #reason #proof #apps` (apps one URL per line; slug-only URLs send track id 0).
- Each request is reviewed by a human before removal. If the Cloudflare challenge or a 403 appears, stop and tell the user rather than working around it.
