# PaperDrop — AWS Amplify Gen 2

A clean, GitHub-ready Next.js + TypeScript + AWS Amplify Gen 2 PDF library.

## Included

- Next.js App Router frontend
- Amplify Auth (Cognito) with an `ADMINS` group
- Amplify Data for sections, pending submissions and published PDFs
- Amplify Storage (S3) for PDF files
- Public visitors can read/download approved PDFs and submit PDFs for review
- Visitor uploads stay under `pending/` and are not public
- Only `ADMINS` can approve, reject, publish, delete, and create sections
- Admins can also upload a PDF directly to a section and publish it
- Five starter sections, including Graphics
- Odd final section card is centered automatically
- 50 MB UI upload limit

## Important

This repository is intentionally a **single clean project root**. Do not upload a parent folder containing another project. The GitHub repository root must directly contain `package.json`, `package-lock.json`, `amplify/`, `app/`, and `amplify.yml`.

## Deploy with GitHub + AWS Amplify

1. Extract this ZIP.
2. Open the `paperdrop-final` folder.
3. Upload/push the **contents of that folder** to the root of a new GitHub repository.
4. In AWS Amplify Hosting, connect that GitHub repository and branch.
5. Keep the included `amplify.yml` build settings.
6. Deploy.
7. After the first backend deployment, create your Cognito admin user in AWS and put that user in the `ADMINS` group.
8. Open `/admin` on your deployed site and sign in.
9. In Admin, click **Create five starter sections** if the database is empty.

## GitHub from a terminal

From the project root:

```bash
git init
git add .
git commit -m "Initial PaperDrop AWS Amplify project"
git branch -M main
git remote add origin YOUR_GITHUB_REPOSITORY_URL
git push -u origin main
```

## Moderation flow

Visitor → PDF upload → `pending/` S3 object + pending database record → admin review → copy to `public/` → published document → public download.

Rejecting a submission removes its pending object and database record. Deleting a published document removes its public S3 object and database record.
