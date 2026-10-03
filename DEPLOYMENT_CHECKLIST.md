# PAPERDROPL deployment checklist

This archive was audited and cleaned for AWS Amplify Gen 2 deployment.

## Fixed in this build

- Fixed the public-library loader so a successful AWS request clears the previous error state.
- Added the missing `/public/anime/backgrounds/cloud.svg` asset.
- Made PDF MIME validation tolerant of browsers that report an empty MIME type while the filename ends in `.pdf`.
- Added error handling for admin Data list operations.
- Made admin approval retryable when a previous attempt already created the public document.
- Added rollback cleanup for failed admin public uploads/document creation.
- Removed generated `.next`, `.amplify`, `node_modules`, and npm cache artifacts from this deployment archive.

## Backend access model

- Public/guest users: read Sections and Documents.
- Public/guest users: create Submission records.
- Public/guest users: write PDFs under `pending/*`.
- Admins in the `ADMINS` Cognito group: manage Sections, Documents, and Submissions.
- Admins: read/write/delete `public/*` and manage `pending/*`.

## AWS Amplify deployment

The included `amplify.yml` runs:

1. `npm ci`
2. `npx ampx pipeline-deploy --branch $AWS_BRANCH --app-id $AWS_APP_ID`
3. `npm run build`

Amplify CI/CD generates the branch-specific `amplify_outputs.json` during the backend phase.

The included `amplify_outputs.json` is the currently generated sandbox/client configuration and is not an AWS secret. It should be replaced by the deployment-generated output when the Amplify branch is deployed.

## Local verification

From the project root:

```bash
npm ci
npm run build
```

For full local backend development:

```bash
npm run sandbox
```

in one terminal, then:

```bash
npm run dev
```

in another.

## Important

The archive intentionally does not contain generated build/cache directories. Amplify should build those during deployment.

## Post-upgrade verification

- The backend build now always runs `npx ampx pipeline-deploy` so later frontend-only commits cannot accidentally skip a pending Amplify schema change.
- The backend phase also runs `npx ampx generate outputs --branch $AWS_BRANCH --app-id $AWS_APP_ID` so the frontend build receives outputs for the deployed branch.
- Current application code includes the expanded Section, Submission, Document, DocumentVersion, Report, and ActivityLog schema. A cloud deployment is still required before those new backend models/fields can work against the production environment.

## Known incomplete items

- True first-page PDF thumbnails are not generated yet; cards use a lightweight fallback when `thumbnailPath` is empty.
- There is no backend PDF-processing function yet; metadata/hash validation currently runs in the browser.
- Public/admin upload queues are implemented separately rather than through one shared upload engine.
- Public search is client-side over loaded records; large-library pagination/server-side search is not implemented.
- Admin bulk reject, select-all/deselect-all, Delete-key trash shortcut, and activity-log-specific search are not implemented yet.
- The admin actor is currently recorded as a generic `admin` string rather than the signed-in user's identity.
- The global CSS file still contains accumulated legacy rules and upgrade overrides rather than a full consolidation pass.
