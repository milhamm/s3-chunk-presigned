export const FILE_UPLOAD_STATUS = {
  completed: "completed",
  pending: "pending",
  waiting: "waiting",
  error: "error",
} as const;

export type FileUploadStatus = keyof typeof FILE_UPLOAD_STATUS;
