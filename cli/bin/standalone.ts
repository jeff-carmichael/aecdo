// Entry point for `bun build --compile`. Import order matters: assets must be
// registered before aecdo.ts evaluates and starts main().
import "./embed-assets.js";
import "./aecdo.js";
