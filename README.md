# PAPERDROPL

## Local full-stack development

PAPERDROPL uses an AWS Amplify Gen 2 Cloud Sandbox for its real backend. The sandbox is a real, isolated AWS backend for development; it is not a local emulator.

### 1. Install dependencies

```bash
npm ci
```

### 2. Start the backend sandbox

```bash
npm run sandbox
```

Keep this terminal running. Amplify will create/update `amplify_outputs.json` with the sandbox backend configuration.

### 3. Start Next.js in another terminal

```bash
npm run dev
```

Open `http://localhost:3000`.

The same application code can then be deployed through Amplify Hosting. Amplify CI/CD generates the branch-specific `amplify_outputs.json` during the backend phase. The copy included in a working archive may point to a sandbox and should be replaced by the deployment-generated output.

### Optional one-command local start

```bash
npm run dev:fullstack
```

This creates/updates the sandbox once and then starts Next.js.

## AWS deployment

Connect this repository/branch to AWS Amplify Hosting. The `amplify.yml` deploys the backend first and then builds the Next.js frontend, so the generated `amplify_outputs.json` is available during the frontend build.

## Admin account

The Cognito user must belong to the `ADMINS` group before `/admin` can manage submissions, sections, and published documents.

## Important

`amplify_outputs.json` is a generated client-configuration file, not a credentials file. Amplify CI/CD regenerates it for the deployed branch. Do not manually edit AWS endpoints or treat this file as a place for secrets.
