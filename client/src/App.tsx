import axios, { AxiosResponse } from "axios";

type PresignedResponse = {
  filename: string;
  preSignedUrl: Record<number, string>;
};

const BASE_URL = "http://localhost:8080";
const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB per chunks

const splitToChunks = (file: File) => {
  const { size, name } = file;

  const chunks: Blob[] = [];

  for (let i = 0; i < size; i += CHUNK_SIZE) {
    chunks.push(file.slice(i, i + CHUNK_SIZE));
  }

  return {
    chunks,
    length: chunks.length,
    name,
  };
};

const api = axios.create({ baseURL: BASE_URL });

function App() {
  const handleOnFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    const { files } = e.target;

    if (!files?.length) return;

    const [file] = Array.from(files as FileList);

    const { chunks, name, length } = splitToChunks(file);

    const response = await api.post<PresignedResponse>(`/upload`, {
      filename: name,
      parts: length,
    });

    const { preSignedUrl } = response.data;

    const urlParams = new URLSearchParams(preSignedUrl["1"]);
    const uploadId = urlParams.get("uploadId");

    const keys = Object.keys(preSignedUrl);

    const promises = keys.reduce((acc, curr, i) => {
      acc.push(axios.put(preSignedUrl[+curr], chunks[i]));
      return acc;
    }, [] as Promise<AxiosResponse<unknown, unknown>>[]);

    Promise.all(promises)
      .then(async (response) => {
        // Complete the request when all chunks are uploaded
        await api.post(`/upload/${uploadId}/complete`, {
          filename: name,
          completedParts: {
            eTag: response[0].headers["etag"],
            partNumber: 1,
          },
        });
      })
      .catch(async () => {
        // Abort the process when an error occurs
        await api.post(`/upload/${uploadId}/abort`, {
          filename: name,
        });
      });
  };

  return (
    <div>
      <input onChange={handleOnFile} type="file" name="file" id="file" />
    </div>
  );
}

export default App;
