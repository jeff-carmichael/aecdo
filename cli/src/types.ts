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
  title: string;
  drawingType?: "plan" | "section" | "elevation" | "detail";
  scale?: string;
  bbox: [number, number, number, number];
  layers: Layer[];
  references?: string[];
}

export interface Table {
  "@id": string;
  "@type": "Table";
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

export interface Sheet {
  "@id": string;
  "@type": "Sheet";
  sheetNumber: string;
  title: string;
  pageIndex: number;
  drawings?: Drawing[];
  tables?: Table[];
  notes?: Note[];
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
