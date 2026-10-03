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
