import { loadSchema, createValidator } from "../lib/schema.js";
import { output } from "../lib/output.js";
import type { DrawingSet, CommandOptions } from "../types.js";
import type { ErrorObject } from "ajv";

export async function validate(data: DrawingSet, filePath: string, opts: CommandOptions = {}): Promise<boolean> {
  const schema = await loadSchema(opts.schema);
  const validateFn = createValidator(schema);
  const valid = validateFn(data);

  if (opts.format === "json") {
    const result = {
      valid,
      file: filePath,
      errors: valid ? [] : formatErrors(validateFn.errors!),
    };
    await output(result, opts);
  } else {
    if (valid) {
      console.log(`✓ ${filePath} is valid against AECDO schema.`);
    } else {
      console.log(`✗ ${filePath} has validation errors:\n`);
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
  }

  if (!valid) process.exitCode = 1;
  return valid;
}

function formatErrors(errors: ErrorObject[]) {
  return errors.map((err) => ({
    path: err.instancePath || "/",
    message: err.message,
    params: err.params,
  }));
}
