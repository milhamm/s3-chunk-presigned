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
const CHUNK_SIZE = 5 * 1024 * 1024; // 10MB per chunks

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

  const uploadToS3 = async ({
    chunks,
    preSignedUrls,
    uploadId,
    filename,
  }: UploadToS3Params) => {
    const keys = Object.keys(preSignedUrls);
    const promises = keys.reduce((acc, curr, i) => {
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
