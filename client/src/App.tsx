import { useState } from "react";

import { Container, SimpleGrid } from "@mantine/core";
import { FileWithPath } from "@mantine/dropzone";

import { UploadService } from "@/service";
import { FileObj, Files } from "@/types";
import { File, FileUploadDropzone } from "@/ui";
import { FILE_UPLOAD_STATUS } from "@/utils/constants";
import { normalize } from "@/utils/normalize";

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB per chunks

const splitToChunks = (file: File) => {
  const { size, name } = file;

  const chunks: Blob[] = [];

  for (let i = 0; i < size; i += CHUNK_SIZE) {
    chunks.push(file.slice(i, Math.min(i + CHUNK_SIZE, size)));
  }

  return {
    chunks,
    parts: chunks.length,
    filename: name,
  };
};

function App() {
  const [files, setFiles] = useState<Files>({});

  const updateFileStateByUploadId = (
    uploadId: string,
    updatedFn: (files: Files) => Partial<FileObj>
  ) => {
    setFiles((files) => ({
      ...files,
      [uploadId]: {
        ...files[uploadId],
        ...updatedFn(files),
      },
    }));
  };

  /**
   * Generates multiple presigned URLs for the given file object to allow uploading to an S3 bucket in chunks.
   *
   * @param file The file object for which to generate the presigned URL.
   * @returns A promise that resolves with an object containing the presigned URL and other details needed for uploading the file.
   */
  const getPresignedUrls = async (file: File): Promise<FileObj> => {
    const chunks = splitToChunks(file);

    const response = await UploadService.getPresignedUrls({
      file,
      ...chunks,
    });

    return response;
  };

  /**
   * Uploads file chunks to an S3 bucket using the generated presigned URLs.
   * If the upload is successful, the upload is completed by passing the upload ID.
   * If there is an error, the upload process is aborted using the same upload ID.
   *
   * @param params An object containing the necessary parameters for the upload.
   * @param params.chunks An array of file (Blob[]) chunks to be uploaded.
   * @param params.preSignedUrls An object containing the presigned URLs for each file chunk.
   * @param params.uploadId The upload ID associated with the upload.
   * @param params.filename The name of the file being uploaded.
   */
  const uploadToS3 = async ({ uploadId, ...file }: FileObj) => {
    const upload = UploadService.putChunksToS3({
      uploadId,
      ...file,
      onCompleted() {
        updateFileStateByUploadId(uploadId, () => ({
          status: FILE_UPLOAD_STATUS.completed,
        }));
      },
      onAbort() {
        updateFileStateByUploadId(uploadId, () => ({
          status: FILE_UPLOAD_STATUS.error,
        }));
      },
      onEachChunkUploaded() {
        updateFileStateByUploadId(uploadId, (files) => ({
          status: FILE_UPLOAD_STATUS.pending,
          progress: files[uploadId].progress + 1,
        }));
      },
    });

    upload.start();
  };

  const handleOnDrop = async (files: FileWithPath[]) => {
    const presignedUrls = await Promise.all(
      files.map((file) => getPresignedUrls(file))
    );

    const normalizedResponse = normalize(presignedUrls, "uploadId");
    setFiles(normalizedResponse);

    await Promise.all(
      Object.values(normalizedResponse).map((uploadParams) =>
        uploadToS3(uploadParams)
      )
    );
  };

  return (
    <Container style={{ marginTop: "1rem" }}>
      <SimpleGrid cols={5}>
        <FileUploadDropzone onDrop={handleOnDrop} />
        {Object.values(files).map(
          ({ uploadId, progress, chunks, status, filename }) => {
            return (
              <File
                key={uploadId}
                name={filename}
                status={status}
                progressValue={Math.round((progress / chunks.length) * 100)}
              />
            );
          }
        )}
      </SimpleGrid>
    </Container>
  );
}

export default App;
