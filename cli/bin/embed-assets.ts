import pkg from "../../package.json" with { type: "json" };
import schema from "../../ontology/v0.3.0/aecdo.schema.json" with { type: "json" };
import { registerBunOAuthFlows } from "@earendil-works/pi-ai/bun-oauth";
import { bedrockProviderModule } from "@earendil-works/pi-ai/bedrock-provider";
import { setBedrockProviderModule } from "@earendil-works/pi-ai/api/bedrock-converse-stream.lazy";
import { basename } from "node:path";
import { embedded } from "../src/lib/embedded.js";
import { guiAssets } from "./gui-assets.js";

embedded.version = pkg.version;
embedded.schema = schema;
// pi loads its OAuth flows with runtime-computed imports that a compiled binary can't resolve.
registerBunOAuthFlows();
// Same for the Bedrock client: pi imports the AWS SDK through a path the bundler can't follow.
setBedrockProviderModule(bedrockProviderModule);

embedded.guiAssets = guiAssets;
// `aecdo gui` opens its window by running this binary again (or `bun standalone.ts` in development).
const compiled = !/^bun(\.exe)?$/i.test(basename(process.execPath));
embedded.windowCommand = (url) => (compiled ? [process.execPath, "__gui-window", url] : [process.execPath, process.argv[1], "__gui-window", url]);
