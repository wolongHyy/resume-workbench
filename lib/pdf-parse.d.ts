declare module "pdf-parse" {
  const pdfParse: (
    buffer: Buffer,
    options?: Record<string, unknown>
  ) => Promise<{ numpages: number; numrender: number; info: unknown; metadata: unknown; text: string; version: unknown }>;
  export default pdfParse;
}
