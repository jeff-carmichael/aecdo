import { loadSchema, createValidator } from "../lib/schema.js";
import { basename, resolve } from "node:path";
import { output } from "../lib/output.js";
import { checkSourcePdf, type PdfMatch } from "../lib/source-pdf.js";
import type { DrawingSet, CommandOptions } from "../types.js";
import type { ErrorObject } from "ajv";

/** Checks a set against the schema without printing anything. */
export async function isValid(data: DrawingSet, schemaPath?: string): Promise<boolean> {
  return Boolean(createValidator(await loadSchema(schemaPath))(data));
}

export async function validate(data: DrawingSet, filePath: string, opts: CommandOptions = {}): Promise<boolean> {
  const schema = await loadSchema(opts.schema);
  const validateFn = createValidator(schema);
  const valid = validateFn(data);
  const pdfPath = opts.pdf ? resolve(opts.pdf) : undefined;
  const pdf = pdfPath ? await checkSourcePdf(data, pdfPath) : undefined;

  if (opts.format === "json") {
    const result = {
      valid,
      file: filePath,
      errors: valid ? [] : formatErrors(validateFn.errors!),
      ...(pdfPath && pdf ? { pdf: { file: pdfPath, matches: pdf.matches ?? null, ...(pdf.markupCopy ? { markupCopy: true } : {}) } } : {}),
    };
    await output(result, opts);
  } else {
    if (valid) {
      console.log(`${filePath} is valid against AECDO schema.`);
    } else {
      console.log(`${filePath} has validation errors:\n`);
      for (const err of validateFn.errors!) {
        console.log(`  ${err.instancePath || "/"}: ${err.message}`);
        if (err.params) {
          const details = Object.entries(err.params)
            .map(([k, v]) => `${k}: ${v}`)
            .join(", ");
          console.log(`    (${details})`);
        }
      }
    }
    if (pdfPath && pdf) console.log(pdfLine(basename(pdfPath), pdf));
  }

  if (!valid || pdf?.matches === false) process.exitCode = 1;
  return valid;
}

function pdfLine(name: string, pdf: PdfMatch): string {
  if (pdf.matches === undefined) {
    return pdf.markupCopy
      ? `${name} is a markup copy that doesn't say which PDF it came from, so it can't be checked.`
      : `The set has no sourcePdfSha256, so ${name} can't be checked against it.`;
  }
  if (pdf.markupCopy) return pdf.matches ? `${name} is a markup copy of the PDF this set was made from.` : `${name} doesn't match: it's a markup copy of a different PDF than the one this set was made from.`;
  return pdf.matches ? `${name} is the PDF this set was made from.` : `${name} doesn't match: it isn't the PDF this set was made from.`;
}

function formatErrors(errors: ErrorObject[]) {
  return errors.map((err) => ({
    path: err.instancePath || "/",
    message: err.message,
    params: err.params,
  }));
}
