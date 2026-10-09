import { createHash, randomUUID } from "node:crypto";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { env } from "$amplify/env/submitPdfForReview";
import type { Schema } from "../../data/resource";

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);
const client = generateClient<Schema>();
const models = client.models as any;
const s3 = new S3Client({});

export const handler = async (event: { arguments: { originalName: string; storagePath: string; size: number; sectionId: string; pageCount?: number | null; title?: string | null; author?: string | null; fileHash: string } }): Promise<boolean> => {
  const { originalName, storagePath, size, sectionId, pageCount, title, author } = event.arguments;
  const fileHash = event.arguments.fileHash.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(fileHash)) throw new Error("Invalid PDF hash.");
  if (!storagePath.startsWith("pending/") || storagePath.includes("..") || storagePath.includes("\\")) {
    throw new Error("Invalid pending upload path.");
  }
  if (!Number.isInteger(size) || size < 1 || size > 50 * 1024 * 1024) throw new Error("Invalid PDF size.");
  if (!sectionId || !originalName.trim()) throw new Error("A file name and section are required.");
  const section = await models.Section.get({ id: sectionId });
  if (section.errors?.length) throw new Error(section.errors[0].message);
  if (!section.data) throw new Error("The selected section does not exist.");

  const object = await s3.send(new GetObjectCommand({
    Bucket: env.PAPER_DROP_FILES_BUCKET_NAME,
    Key: storagePath,
  }));
  if (!object.Body || object.ContentLength !== size || object.ContentLength > 50 * 1024 * 1024) {
    throw new Error("The uploaded PDF size does not match the submission.");
  }
  const digest = createHash("sha256");
  let bytesRead = 0;
  let prefix = Buffer.alloc(0);
  for await (const chunk of object.Body as AsyncIterable<Uint8Array>) {
    const bytes = Buffer.from(chunk);
    bytesRead += bytes.length;
    if (bytesRead > size || bytesRead > 50 * 1024 * 1024) throw new Error("The uploaded PDF size does not match the submission.");
    if (prefix.length < 5) prefix = Buffer.concat([prefix, bytes.subarray(0, 5 - prefix.length)]);
    digest.update(bytes);
  }
  if (bytesRead !== size) throw new Error("The uploaded PDF size does not match the submission.");
  if (prefix.toString("ascii") !== "%PDF-") throw new Error("The uploaded file is not a valid PDF.");
  if (digest.digest("hex") !== fileHash) throw new Error("The uploaded PDF hash does not match its contents.");

  const [documents, priorSubmissions] = await Promise.all([
    models.Document.list({ filter: { fileHash: { eq: fileHash } }, limit: 1 }),
    models.Submission.list({ filter: { fileHash: { eq: fileHash } }, limit: 1 }),
  ]);
  if (documents.errors?.length) throw new Error(documents.errors[0].message);
  if (priorSubmissions.errors?.length) throw new Error(priorSubmissions.errors[0].message);
  if (documents.data.some((item: any) => item.fileHash === fileHash) || priorSubmissions.data.some((item: any) => item.fileHash === fileHash && item.status === "pending")) {
    throw new Error("This PDF has already been submitted or is already in the library.");
  }

  const submissionId = randomUUID();
  const reservation = await models.HashReservation.create({
    id: fileHash,
    status: "pending",
    submissionId,
  });
  if (reservation.errors?.length || !reservation.data) {
    const existing = await models.HashReservation.get({ id: fileHash });
    if (existing.data) throw new Error("This PDF has already been submitted or is already in the library.");
    throw new Error(reservation.errors?.[0]?.message ?? "The hash reservation could not be created.");
  }

  try {
    const result = await models.Submission.create({
      id: submissionId,
      originalName: originalName.trim().slice(0, 180),
      storagePath,
      size,
      sectionId,
      status: "pending",
      pageCount: pageCount ?? undefined,
      title: title?.slice(0, 260) ?? undefined,
      author: author?.slice(0, 260) ?? undefined,
      fileHash,
      processingStatus: "complete",
    });
    if (result.data) return true;
    throw new Error(result.errors?.[0]?.message ?? "The submission could not be saved.");
  } catch (error) {
    // A timed-out/ambiguous create may have persisted despite returning an error.
    // Keep the reservation whenever a matching submission exists; otherwise a
    // second upload could claim the same hash while the first submission is live.
    const saved = await models.Submission.get({ id: submissionId });
    if (saved.errors?.length) {
      throw new Error("Submission status is uncertain; the hash reservation was retained for safety.");
    }
    if (saved.data) {
      if (saved.data.fileHash === fileHash && saved.data.storagePath === storagePath) return true;
      throw new Error("A submission record exists but does not match this upload; its hash reservation was retained.");
    }

    const held = await models.HashReservation.get({ id: fileHash });
    if (held.errors?.length) {
      throw new Error("The submission failed and its hash reservation could not be safely checked.");
    }
    if (held.data?.submissionId === submissionId && held.data.status === "pending") {
      const released = await models.HashReservation.delete({ id: fileHash });
      if (released.errors?.length) throw new Error("The submission failed and its hash reservation could not be released.");
    }
    throw error;
  }
};
