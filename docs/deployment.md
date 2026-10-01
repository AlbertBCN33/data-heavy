# Deployment

The app is a static SPA (see [ADR 0003](adr/0003-client-side-rendering.md)) served by
**Firebase Hosting on the free Spark plan**. GitHub Actions deploys it on every push to `main`,
after CI has passed.

- [One-time setup](#one-time-setup)
  - [1. GitHub repository](#1-github-repository)
  - [2. Firebase project](#2-firebase-project)
  - [3. CI credentials (service account)](#3-ci-credentials-service-account)
  - [4. GitHub environment and secret](#4-github-environment-and-secret)
  - [5. Local environment](#5-local-environment)
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
   - Require status checks to pass: the `ci` job (and `lighthouse` once it exists).
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
5. In the project, go to **Build → Hosting → Get started** and click through the wizard. The CLI
   steps it shows are already handled by this repository (`firebase.json`, `.firebaserc`).
6. Optional: confirm the CLI can see the project from your machine:

   ```sh
   npm install -g firebase-tools   # skip if `firebase --version` already works
   firebase login
   firebase projects:list          # the new project ID should appear
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
   - If the deploy action later fails with a permission error about API keys, also add
     **API Keys Viewer** (`roles/serviceusage.apiKeysViewer`). The exact role set is verified
     during the first deploy and recorded here.
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

### 5. Local environment

Only needed if you want to run a manual deploy or the Firebase emulator locally.

```sh
cp .env.example .env    # .env is git-ignored
# set FIREBASE_PROJECT_ID=<your project id>
```

## Secrets policy

- Nothing secret is committed: `.env` is git-ignored and `.env.example` lists the variable names only.
- The app itself needs **no API keys**. Market data is a bundled static snapshot.
- The only credential is the CI service account key, stored as a GitHub environment secret and
  limited to the `production` environment on `main`.
- To rotate the key, create a new key on the service account, update the secret, then delete the old key in
  the Google Cloud console.
