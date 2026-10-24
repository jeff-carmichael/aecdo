import pkg from "../../package.json" with { type: "json" };
import schema from "../../ontology/v0.3.0/aecdo.schema.json" with { type: "json" };
import { embedded } from "../src/lib/embedded.js";

embedded.version = pkg.version;
embedded.schema = schema as Record<string, unknown>;
