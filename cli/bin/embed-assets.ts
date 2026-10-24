import pkg from "../../package.json" with { type: "json" };
import schema from "../../ontology/v0.3.0/aecdo.schema.json" with { type: "json" };
import { registerBunOAuthFlows } from "@earendil-works/pi-ai/bun-oauth";
import { embedded } from "../src/lib/embedded.js";

embedded.version = pkg.version;
embedded.schema = schema;
// pi loads its OAuth flows with runtime-computed imports that a compiled binary can't resolve.
registerBunOAuthFlows();
