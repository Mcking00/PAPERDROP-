import { defineStorage } from "@aws-amplify/backend";

export const storage = defineStorage({
  name: "paperDropFiles",
  access: (allow) => ({
    "pending/*": [
      allow.guest.to(["write"]),
      allow.groups(["ADMINS"]).to(["read", "write", "delete"]),
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
