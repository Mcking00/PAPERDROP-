import { defineStorage } from "@aws-amplify/backend";
import { submitPdfForReview } from "../functions/submit-pdf-for-review/resource";

export const storage = defineStorage({
  name: "paperDropFiles",
  access: (allow) => ({
    "pending/*": [
      allow.guest.to(["write"]),
      allow.groups(["ADMINS"]).to(["read", "write", "delete"]),
      allow.resource(submitPdfForReview).to(["read"]),
    ],
    "public/*": [
      allow.guest.to(["read"]),
      allow.groups(["ADMINS"]).to(["read", "write", "delete"]),
    ],
    "archive/*": [
      allow.groups(["ADMINS"]).to(["read", "write", "delete"]),
    ],
    "trash/*": [
      allow.groups(["ADMINS"]).to(["read", "write", "delete"]),
    ],
    "thumbnails/*": [
      allow.guest.to(["read"]),
      allow.groups(["ADMINS"]).to(["read", "write", "delete"]),
    ],
  }),
});
