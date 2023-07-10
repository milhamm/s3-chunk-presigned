import axios, { AxiosResponse } from "axios";

import api from "@/client/api";
import { Chunks } from "@/types";
import { FILE_UPLOAD_STATUS } from "@/utils/constants";

type InitUploadParams = {
  file: string;
};

type InitResponose = string;

type GenerateUploadParams = {
  file: string;
  uploadId: string;
  partsCount: number;
};

type PutChunksToS3Response = AxiosResponse<unknown, unknown>;

type PutChunksToS3Params = {
  preSignedUrls: Record<number, string>;
  chunks: Chunks;
  uploadId: string;
  filename: string;
  onEachChunkUploaded: () => void;
  onCompleted: () => void;
  onAbort: () => void;
};

export type GenerateResponse = string[];

export type PresignedResponse = {
  filename: string;
  preSignedUrls: Record<number, string>;
  uploadId: string;
};

export const UploadService = {
  async init({ file }: InitUploadParams) {
    const { data } = await api.post<InitResponose>(`/files/init`, {
      file,
    });

    return data;
  },
  async generate({ partsCount, file, uploadId }: GenerateUploadParams) {
    const { data } = await api.post<GenerateResponse>(`/files/generate`, {
      partsCount,
      file,
      uploadId,
    });

    return data;
  },

  putChunksToS3({
    filename,
    uploadId,
    chunks,
    preSignedUrls,
    onEachChunkUploaded,
    onAbort,
    onCompleted,
  }: PutChunksToS3Params) {
    const partsNumber = Object.keys(preSignedUrls);

    const uploadPromises = partsNumber.reduce((acc, curr, i) => {
      // Upload each file chunk to S3 using PUT request
      acc.push(
        axios.put<unknown>(preSignedUrls[+curr], chunks[i]).then((val) => {
          onEachChunkUploaded();
          return val;
        })
      );
      return acc;
    }, [] as Promise<PutChunksToS3Response>[]);

    return {
      start() {
        const handleComplete = (response: PutChunksToS3Response[]) => {
          const completedParts = response.map((res, idx) => ({
            eTag: res.headers["etag"],
            partNumber: idx + 1,
          }));

          //   Complete the upload process
          return api.post(`/upload/${uploadId}/complete`, {
            filename,
            completedParts: completedParts,
          });
        };

        const handleAbort = () =>
          //   Abort the upload process when an error occurs
          api.post(`/upload/${uploadId}/abort`, {
            filename,
          });

        Promise.all(uploadPromises)
          .then(async (res) => {
            await handleComplete(res);
            onCompleted();
          })
          .catch(async () => {
            await handleAbort();
            onAbort();
          });
      },
    };
  },
};
