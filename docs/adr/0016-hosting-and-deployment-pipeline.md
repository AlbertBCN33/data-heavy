# 0016. Hosting and deployment pipeline

- Status: Accepted
- Date: 2026-10-02

## Context

The app is a static SPA ([ADR 0003](0003-client-side-rendering.md)) hosted on Firebase Hosting's free
plan, and deployed from `main` after CI. The deploy must not ship a broken site. That rules out a
plain "deploy and hope" step, and the free plan offers no traffic splitting. The hosting layer
also adds behaviour the app depends on: the SPA rewrite, cache headers and security headers.
Until now, the e2e tests never exercised that layer.

## Decision

**Pipeline** (the `deploy` job in `.github/workflows/ci.yml`, on pushes to `main` that affect the
app):

1. The `ci` job uploads the production build it has just tested. `deploy` downloads it, so the
   deployed files are exactly the tested ones and nothing is rebuilt.
2. Deploy to a **`staging` preview channel** (free on Spark, expires after 7 days) and run the
   `@smoke` e2e tests against its URL.
3. **Promote** that same version to live with `firebase hosting:clone staging → live`. No new
   upload, so live gets exactly the files that passed the staging smoke tests.
4. **Post-deploy checks on live:** the live `index.html` must be byte-identical to the build
   (retried for a minute), then the same smoke tests run against the live URL.

If staging fails, live is never touched. If the live checks fail, the job goes red and the
previous release is one click away in the Firebase console (Hosting → release history →
Rollback). Rollback is not automated: a failure after a successful staging run points to the
hosting platform, not to the build, and needs a human anyway.

The job is opt-in: it is skipped until the repository variable `DEPLOY_ENABLED` is `true`, so `main`
stays green before the Firebase setup exists. It authenticates with `google-github-actions/auth`,
as the other portfolio repositories do. The job runs in the `production` GitHub environment. That is the only place where the
service account key exists, and the environment only accepts `main`. Deploys are serialized and
never cancelled. On `main`, workflow runs queue instead of cancelling each other.

**Hosting configuration** (`firebase.json`):

- **Caching.** Hashed bundles (`main-*.js`, `chunk-*.js`, `worker-*.js`, `styles-*.css`) are
  `immutable` for a year. Everything else is `no-cache`, revalidated with an ETag: `index.html`,
  the service worker files, `ngsw.json`, translations and the data snapshot, whose URLs don't change.
  Firebase's default (`max-age=3600`) would keep users on an old `index.html` or service worker
  manifest for an hour after a deploy.
- **Content Security Policy:** `script-src 'self'` with no inline scripts, plus `object-src 'none'`,
  `base-uri 'self'`, `frame-ancestors 'none'` and same-origin `connect-src`/`worker-src`.
  `style-src` allows `'unsafe-inline'` because Angular injects component styles as `<style>`
  elements, and a static host cannot issue per-request nonces. Inline styles are a much smaller
  risk than inline scripts.
- **Inline critical CSS is off.** It needs an inline `<script>` to swap the stylesheet in, which
  the CSP would block. In a client-rendered app nothing paints before `main.js` runs, so a 0.6 kB
  render-blocking stylesheet loaded in parallel costs little. Measured: LCP unchanged (2.2 s),
  FCP +70 ms.
- Also `X-Content-Type-Options`, `Referrer-Policy`, `Cross-Origin-Opener-Policy` and a
  `Permissions-Policy` that denies unused features. HSTS is not needed in the config: `.app` domains are on the browsers' HSTS preload list.
- No `.firebaserc`: the project ID is passed explicitly from the environment
  (`FIREBASE_PROJECT_ID`), so nothing in the repository is tied to one Firebase project.

**Testing the hosting layer:** `firebase-tools` is a pinned dev dependency. CI's e2e tests serve the
build through the **Firebase Hosting emulator**, so the rewrite, headers and CSP are tested on
every pull request. A dedicated spec checks the headers and walks through a journey that touches the
worker, lazy chunks and runtime translations while listening for CSP violations. The same deploy
uses the same CLI version.

## Consequences

- A CSP or header mistake fails a pull request instead of breaking production.
- A deploy takes a few minutes longer than a direct deploy (two smoke runs). Users never see a
  version that has not passed against real Firebase infrastructure.
- `firebase-tools` adds about 450 packages to `npm ci` (cached).
- On Windows the hosting emulator ignores custom headers: it builds URL patterns with backslashes.
  The app works and the header checks are skipped locally. CI (Linux) and Firebase apply them.
- The service account uses a long-lived JSON key, limited to Firebase Hosting Admin and to the
  `production` environment. Workload Identity Federation would remove the key at the cost of more IAM
  setup ([docs/deployment.md](../deployment.md)).
- Possible extensions: per-PR preview channels, which would need the key outside `production`,
  and Trusted Types in the CSP, which needs the query worker's script URL to go through a policy.
