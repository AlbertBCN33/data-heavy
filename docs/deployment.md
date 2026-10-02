# Deployment

The app is a static SPA (see [ADR 0003](adr/0003-client-side-rendering.md)) served by
**Firebase Hosting on the free Spark plan**. GitHub Actions deploys it on every push to `main`
that changes the app, after CI has passed. Decisions are in
[ADR 0016](adr/0016-hosting-and-deployment-pipeline.md).

- [One-time setup](#one-time-setup)
  - [1. GitHub repository](#1-github-repository)
  - [2. Firebase project](#2-firebase-project)
  - [3. CI credentials (service account)](#3-ci-credentials-service-account)
  - [4. GitHub environment and secret](#4-github-environment-and-secret)
  - [5. Local environment](#5-local-environment)
- [How a deploy works](#how-a-deploy-works)
- [Rolling back](#rolling-back)
- [Running the hosting setup locally](#running-the-hosting-setup-locally)
- [Secrets policy](#secrets-policy)

## One-time setup

### 1. GitHub repository

1. Go to <https://github.com/new> while signed in as `AlbertBCN33`.
2. Fill in:
   - **Repository name:** `data-heavy`
   - **Description:** `Fast, accessible market screener for 10k+ instruments: Angular, Nx, Web Workers, virtual scrolling.`
   - **Visibility:** Public (the code is part of the portfolio).
   - **Do not** add a README, `.gitignore` or license. The local repository already has its first
     commit, and an initialized remote would cause a merge conflict on the first push.
3. Click **Create repository**, then connect the local repository (from the workspace root):

   ```sh
   git remote add origin https://github.com/AlbertBCN33/data-heavy.git
   git push -u origin main
   git push -u origin feat/foundation
   ```

4. **Settings → General → Pull Requests:** enable _Allow squash merging_ and
   _Automatically delete head branches_. Disable merge commits if you prefer a linear history.
5. **Settings → Branches → Add branch ruleset** for `main` (do this once CI has run at least once,
   so the check names exist):
   - Require a pull request before merging.
   - Require status checks to pass: the `ci` job (it includes Lighthouse CI).
   - Block force pushes.

### 2. Firebase project

1. Open <https://console.firebase.google.com/> and click **Create a project**.
2. **Project name:** `data-heavy`. Firebase proposes a globally unique **project ID** such as
   `data-heavy-1a2b3`. Write it down. It becomes the default hosting URL:
   `https://<project-id>.web.app`.
3. **Google Analytics:** disable it. The app does not need it, and it adds an extra script and consent
   requirements.
4. Stay on the **Spark (free) plan**. Do not upgrade: Hosting, including
   [preview channels](https://firebase.google.com/docs/hosting/test-preview-deploy), works on Spark.
   Check the current Hosting quotas at <https://firebase.google.com/pricing>.
5. In the project, go to **Build → Hosting → Get started** and click through the wizard. Skip the
   CLI steps it shows: this repository already has `firebase.json`, and the project ID is passed
   explicitly, so there is no `.firebaserc`.
6. Optional: confirm the CLI can see the project from your machine (`firebase-tools` is a dev
   dependency, so no global install is needed):

   ```sh
   npx firebase login
   npx firebase projects:list      # the new project ID should appear
   ```

### 3. CI credentials (service account)

CI deploys with a dedicated service account that has the minimum role it needs. Personal
credentials are never used.

1. Open the Google Cloud console for the same project:
   <https://console.cloud.google.com/iam-admin/serviceaccounts?project=PROJECT_ID>
   (replace `PROJECT_ID`).
2. **Create service account**
   - Name: `github-deployer`
   - Role: **Firebase Hosting Admin** (`roles/firebasehosting.admin`)
   - If the first deploy fails with a permission error, the log names the missing permission.
     Add the narrowest role that grants it, and record it here.
3. Open the service account → **Keys → Add key → Create new key → JSON**. A file downloads.
4. Treat that file like a password. Do not move it into the repository folder. You will paste its
   contents into GitHub in the next step and can delete the file afterwards.

> **Possible future improvement:** replace the JSON key with
> [Workload Identity Federation](https://github.com/google-github-actions/auth#preferred-direct-workload-identity-federation)
> so that no long-lived key exists. It is not used yet because it needs more IAM setup than a portfolio
> project warrants. The tradeoff is recorded in the deployment ADR.

### 4. GitHub environment and secret

The secret lives in a **GitHub environment**, not at repository level. Only jobs that declare
`environment: production` can read it, and the environment can be restricted to `main`.

1. Repository **Settings → Environments → New environment** → name it `production`.
2. **Deployment branches and tags:** _Selected branches and tags_ → add rule `main`.
3. **Environment secrets → Add environment secret:**

   | Name                       | Value                                  |
   | -------------------------- | -------------------------------------- |
   | `FIREBASE_SERVICE_ACCOUNT` | The full contents of the JSON key file |

4. **Environment variables → Add environment variable:**

   | Name                  | Value                        |
   | --------------------- | ---------------------------- |
   | `FIREBASE_PROJECT_ID` | Your project ID (not secret) |

5. Delete the downloaded JSON key file from your machine.
6. **Turn on continuous deployment.** _Settings → Secrets and variables → Actions → Variables →
   New repository variable_: **`DEPLOY_ENABLED`** = `true`. Until then the `deploy` job is skipped,
   so `main` stays green while the setup is incomplete. Set it last, once the steps above are done.

### 5. Local environment

Only needed if you want to run a manual deploy or the Firebase emulator locally.

```sh
cp .env.example .env    # .env is git-ignored
# set FIREBASE_PROJECT_ID=<your project id>
```

## How a deploy works

The `deploy` job runs after the `ci` job on pushes to `main` that change the app:

1. Downloads the production build that `ci` tested (no rebuild).
2. Deploys it to the `staging` preview channel (`https://<project-id>--staging-<hash>.web.app`,
   expires after 7 days) and runs the `@smoke` e2e tests against it: deep link, headers and CSP,
   a journey through the grid, the worker, the drawer and Spanish.
3. Promotes the same version to live (`firebase hosting:clone <project-id>:staging <project-id>:live`).
4. Checks that `https://<project-id>.web.app/` serves this build's `index.html`, then runs the smoke
   tests against live.

A failure in step 2 leaves live untouched. Docs-only changes don't deploy.

## Rolling back

Firebase Console → **Hosting** → release history → **⋮** on the previous release → **Rollback**.
Rollback is instant and needs no CI. Then fix forward with a new pull request, or revert the
merge on `main`; the revert deploys through the normal pipeline.

## Running the hosting setup locally

```sh
npx nx run screener:serve-static   # production build served by the Firebase Hosting emulator on :4200
CI=true npx nx e2e e2e-screener    # e2e against it, as CI does
```

The emulator applies `firebase.json` (rewrites, headers) on Linux and macOS. On Windows it ignores
custom headers because of a path-separator issue, so header checks only run where
`E2E_HOSTING_HEADERS` is set (CI and the deploy smoke tests).

A manual deploy should not be needed. If it is, use the same commands as the workflow:

```sh
npx firebase login
npx firebase hosting:channel:deploy staging --no-authorized-domains --project "$FIREBASE_PROJECT_ID"
```

## Secrets policy

- Nothing secret is committed: `.env` is git-ignored and `.env.example` lists the variable names only.
- The app itself needs **no API keys**. Market data is a bundled static snapshot.
- The only credential is the CI service account key, stored as a GitHub environment secret and
  limited to the `production` environment on `main`.
- To rotate the key, create a new key on the service account, update the secret, then delete the old key in
  the Google Cloud console.
