import { readFile } from "node:fs/promises";
import type { UploadResponse, JobStatus, JobResult } from "../types.js";

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
  }
}

async function request<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    let message: string;
    try {
      message = JSON.parse(body).error ?? body;
    } catch {
      message = body;
    }
    throw new ApiError(response.status, message);
  }

  return response.json() as Promise<T>;
}

export async function createUpload(
  token: string,
  fileName: string,
  baseUrl: string
): Promise<UploadResponse> {
  return request<UploadResponse>(`${baseUrl}/upload`, token, {
    method: "POST",
    body: JSON.stringify({ fileName }),
  });
}

export async function uploadFile(uploadUrl: string, filePath: string): Promise<void> {
  const fileBuffer = await readFile(filePath);

  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/pdf" },
    body: fileBuffer,
  });

  if (!response.ok) {
    throw new ApiError(
      response.status,
      `Failed to upload file to S3 (${response.status}). The upload URL may have expired.`
    );
  }
}

export async function getJobStatus(
  token: string,
  jobId: string,
  baseUrl: string
): Promise<JobStatus> {
  return request<JobStatus>(`${baseUrl}/jobs/${jobId}/status`, token);
}

export async function getJobResult(
  token: string,
  jobId: string,
  baseUrl: string
): Promise<JobResult> {
  return request<JobResult>(`${baseUrl}/jobs/${jobId}/result`, token);
}

export async function downloadResult(downloadUrl: string): Promise<string> {
  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new ApiError(response.status, `Failed to download result (${response.status}).`);
  }
  return response.text();
}
