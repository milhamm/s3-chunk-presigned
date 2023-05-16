import { PresignedResponse } from "@/service";
import { FILE_UPLOAD_STATUS } from "@/utils/constants";

export type FileUploadStatus = keyof typeof FILE_UPLOAD_STATUS;

export type Chunks = Blob[];
export type FileObj = PresignedResponse & {
  progress: number;
  chunks: Chunks;
  file: File;
  status: FileUploadStatus;
};
export type Files = Record<string, FileObj>;
