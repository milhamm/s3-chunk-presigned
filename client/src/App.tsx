import { useState } from "react";
import axios, { AxiosResponse } from "axios";

import { Container, SimpleGrid } from "@mantine/core";
import { FileWithPath } from "@mantine/dropzone";

import { File, FileUploadDropzone } from "@/ui";
import { FILE_UPLOAD_STATUS, FileUploadStatus } from "@/utils/constants";
import { normalize } from "@/utils/normalize";

type PresignedResponse = {
  filename: string;
  preSignedUrls: Record<number, string>;
  uploadId: string;
};

type Chunks = Blob[];

type FileObj = PresignedResponse & {
  progress: number;
  chunks: Chunks;
  file: File;
  status: FileUploadStatus;
};
type Files = Record<string, FileObj>;

type UploadToS3Params = FileObj;

const BASE_URL = "http://localhost:8080";
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB per chunks

const api = axios.create({ baseURL: BASE_URL });

const splitToChunks = (file: File) => {
  const { size, name } = file;

  const chunks: Blob[] = [];

  for (let i = 0; i < size; i += CHUNK_SIZE) {
    chunks.push(file.slice(i, Math.min(i + CHUNK_SIZE, size)));
  }

  return {
    chunks,
    length: chunks.length,
    name,
  };
};

function App() {
  const [filesEntity, setFiles] = useState<Files>({});

  /**
   * Generates multiple presigned URLs for the given file object to allow uploading to an S3 bucket in chunks.
   *
   * @param file The file object for which to generate the presigned URL.
   * @returns A promise that resolves with an object containing the presigned URL and other details needed for uploading the file.
   */
  const getPresignedUrls = async (file: File): Promise<FileObj> => {
    const { length, name, chunks } = splitToChunks(file);

    const response = await api.post<PresignedResponse>(`/upload`, {
      filename: name,
      parts: length,
    });

    return Object.assign(
      { progress: 0, chunks, file, status: FILE_UPLOAD_STATUS.waiting },
      response.data
    );
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
  const uploadToS3 = async ({
    chunks,
    preSignedUrls,
    uploadId,
    filename,
  }: UploadToS3Params) => {
    const keys = Object.keys(preSignedUrls);
    const promises = keys.reduce((acc, curr, i) => {
      // Upload each file chunk to S3 using PUT request
      acc.push(
        axios.put<unknown>(preSignedUrls[+curr], chunks[i]).then((val) => {
          setFiles((files) => ({
            ...files,
            [uploadId]: {
              ...files[uploadId],
              status: FILE_UPLOAD_STATUS.pending,
              progress: files[uploadId].progress + 1,
            },
          }));
          return val;
        })
      );
      return acc;
    }, [] as Promise<AxiosResponse<unknown, unknown>>[]);

    Promise.all(promises)
      .then(async (response) => {
        // Complete the request when all chunks are uploaded
        await api.post(`/upload/${uploadId}/complete`, {
          filename,
          completedParts: response.map((res, idx) => ({
            eTag: res.headers["etag"],
            partNumber: idx + 1,
          })),
        });
        setFiles((files) => ({
          ...files,
          [uploadId]: {
            ...files[uploadId],
            status: FILE_UPLOAD_STATUS.completed,
          },
        }));
      })
      .catch(async () => {
        // Abort the process when an error occurs
        await api.post(`/upload/${uploadId}/abort`, {
          filename,
        });
        setFiles((files) => ({
          ...files,
          [uploadId]: {
            ...files[uploadId],
            status: FILE_UPLOAD_STATUS.error,
          },
        }));
      });
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
        {Object.values(filesEntity).map(
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
