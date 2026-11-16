/** Where advisors' project files live in the private Blob store, and the formats they can share. */
export const projectBlobPrefix = (companyId: string) => `projects/${companyId}/`;

export const PROJECT_FILE_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "image/png",
  "image/jpeg",
];
