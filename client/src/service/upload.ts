import axios, { AxiosResponse } from "axios";

import api from "@/client/api";
import { Chunks } from "@/types";
import { FILE_UPLOAD_STATUS } from "@/utils/constants";

type GetPresignedURLSParams = {
  file: File;
  filename: string;
  parts: number;
  chunks: Chunks;
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

export type PresignedResponse = {
  filename: string;
  preSignedUrls: Record<number, string>;
  uploadId: string;
};

export const UploadService = {
  async getPresignedUrls({
    filename,
    parts,
    chunks,
    file,
  }: GetPresignedURLSParams) {
    const { data } = await api.post<PresignedResponse>(`/upload`, {
      filename,
      parts,
    });

    return Object.assign(
      { chunks, file, status: FILE_UPLOAD_STATUS.waiting, progress: 0 },
      data
    );
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
