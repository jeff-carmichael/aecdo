export interface Item {
  "@id": string;
  "@type": "Item";
  itemType: "tag" | "thing" | "area";
  data: Record<string, unknown>;
  bbox?: [number, number, number, number];
  references?: string[];
}

export interface Layer {
  "@id": string;
  "@type": "Layer";
  name: string;
  bbox?: [number, number, number, number];
  items?: Item[];
}

export interface Drawing {
  "@id": string;
  "@type": "Drawing";
  label: string;
  /** @deprecated pre-v0.3.0 documents used `title`; read via `label` with this as fallback */
  title?: string;
  drawingType?: "plan" | "section" | "elevation" | "detail";
  scale?: string;
  bbox: [number, number, number, number];
  layers: Layer[];
  references?: string[];
}

export interface Table {
  "@id": string;
  "@type": "Table";
  label?: string;
  /** @deprecated pre-v0.3.0 documents used `title`; read via `label` with this as fallback */
  title?: string;
  content: string;
  bbox?: [number, number, number, number];
}

export interface Note {
  "@id": string;
  "@type": "Note";
  content: string;
  bbox?: [number, number, number, number];
}

export type ImageRole = "logo" | "photo" | "detail-raster" | "diagram" | "other";

export interface Image {
  "@id": string;
  "@type": "Image";
  role: ImageRole;
  caption?: string;
  bbox: [number, number, number, number];
}

export interface Sheet {
  "@id": string;
  "@type": "Sheet";
  sheetNumber: string;
  title: string;
  pageIndex: number;
  drawings?: Drawing[];
  tables?: Table[];
  notes?: Note[];
  images?: Image[];
}

export interface DrawingSet {
  "@context"?: string | Record<string, unknown>;
  "@type": "DrawingSet";
  "@id": string;
  filename: string;
  processedDate: string;
  sheets: Sheet[];
}

export interface CommandOptions {
  format?: string;
  pretty?: boolean;
  output?: string;
  schema?: string;
}

export type ApiRegion = "us-west-2";

export interface ApiConfig {
  clientId: string;
  clientSecret: string;
  region: ApiRegion;
  baseUrl: string;
  tokenUrl: string;
}

export interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

export interface UploadResponse {
  jobId: string;
  uploadUrl: string;
  s3Key: string;
}

export interface PageStatus {
  page: string;
  status: "Pending" | "Processing" | "Done" | "Error";
  processingTime?: number | null;
  title?: string | null;
  sheetNumber?: string | null;
  error?: string | null;
}

export interface AgentStatus {
  status: "Pending" | "Processing" | "Done" | "Error";
  startTime?: string | null;
  endTime?: string | null;
  error?: string | null;
}

export interface JobStatus {
  jobId: string;
  fileName: string;
  globalStatus: "Pending" | "Processing" | "Done" | "Error";
  totalPages?: number | null;
  startTime?: string | null;
  agent?: AgentStatus | null;
  pages: PageStatus[];
}

export interface JobResult {
  jobId: string;
  downloadUrl: string;
}

export interface ProcessOptions extends CommandOptions {
  poll?: number;
  wait?: boolean;
  then?: string;
}
