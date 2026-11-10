// The app's web files and PDF.js, bundled into the standalone binary as files (Bun only; types
// in gui-assets.d.ts). Keep in step with APP_FILES in cli/src/gui/assets.ts.

import app_index_html from "../gui/index.html" with { type: "file" };
import app_app_css from "../gui/app.css" with { type: "file" };
import app_app_js from "../gui/app.js" with { type: "file" };
import app_pdf_view_js from "../gui/pdf-view.js" with { type: "file" };
import app_chat_js from "../gui/chat.js" with { type: "file" };
import app_list_js from "../gui/list.js" with { type: "file" };
import app_keys_js from "../gui/keys.js" with { type: "file" };
import pdfjs_pdf_min_mjs from "pdfjs-dist/legacy/build/pdf.min.mjs" with { type: "file" };
import pdfjs_pdf_worker_min_mjs from "pdfjs-dist/legacy/build/pdf.worker.min.mjs" with { type: "file" };
import font_FoxitDingbats_pfb from "pdfjs-dist/standard_fonts/FoxitDingbats.pfb" with { type: "file" };
import font_FoxitFixed_pfb from "pdfjs-dist/standard_fonts/FoxitFixed.pfb" with { type: "file" };
import font_FoxitFixedBold_pfb from "pdfjs-dist/standard_fonts/FoxitFixedBold.pfb" with { type: "file" };
import font_FoxitFixedBoldItalic_pfb from "pdfjs-dist/standard_fonts/FoxitFixedBoldItalic.pfb" with { type: "file" };
import font_FoxitFixedItalic_pfb from "pdfjs-dist/standard_fonts/FoxitFixedItalic.pfb" with { type: "file" };
import font_FoxitSerif_pfb from "pdfjs-dist/standard_fonts/FoxitSerif.pfb" with { type: "file" };
import font_FoxitSerifBold_pfb from "pdfjs-dist/standard_fonts/FoxitSerifBold.pfb" with { type: "file" };
import font_FoxitSerifBoldItalic_pfb from "pdfjs-dist/standard_fonts/FoxitSerifBoldItalic.pfb" with { type: "file" };
import font_FoxitSerifItalic_pfb from "pdfjs-dist/standard_fonts/FoxitSerifItalic.pfb" with { type: "file" };
import font_FoxitSymbol_pfb from "pdfjs-dist/standard_fonts/FoxitSymbol.pfb" with { type: "file" };
import font_LiberationSans_Bold_ttf from "pdfjs-dist/standard_fonts/LiberationSans-Bold.ttf" with { type: "file" };
import font_LiberationSans_BoldItalic_ttf from "pdfjs-dist/standard_fonts/LiberationSans-BoldItalic.ttf" with { type: "file" };
import font_LiberationSans_Italic_ttf from "pdfjs-dist/standard_fonts/LiberationSans-Italic.ttf" with { type: "file" };
import font_LiberationSans_Regular_ttf from "pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf" with { type: "file" };
import wasm_openjpeg_wasm from "pdfjs-dist/wasm/openjpeg.wasm" with { type: "file" };
import wasm_jbig2_wasm from "pdfjs-dist/wasm/jbig2.wasm" with { type: "file" };
import wasm_qcms_bg_wasm from "pdfjs-dist/wasm/qcms_bg.wasm" with { type: "file" };

export const guiAssets = {
  "app/index.html": app_index_html,
  "app/app.css": app_app_css,
  "app/app.js": app_app_js,
  "app/pdf-view.js": app_pdf_view_js,
  "app/chat.js": app_chat_js,
  "app/list.js": app_list_js,
  "app/keys.js": app_keys_js,
  "pdfjs/pdf.min.mjs": pdfjs_pdf_min_mjs,
  "pdfjs/pdf.worker.min.mjs": pdfjs_pdf_worker_min_mjs,
  "pdfjs/standard_fonts/FoxitDingbats.pfb": font_FoxitDingbats_pfb,
  "pdfjs/standard_fonts/FoxitFixed.pfb": font_FoxitFixed_pfb,
  "pdfjs/standard_fonts/FoxitFixedBold.pfb": font_FoxitFixedBold_pfb,
  "pdfjs/standard_fonts/FoxitFixedBoldItalic.pfb": font_FoxitFixedBoldItalic_pfb,
  "pdfjs/standard_fonts/FoxitFixedItalic.pfb": font_FoxitFixedItalic_pfb,
  "pdfjs/standard_fonts/FoxitSerif.pfb": font_FoxitSerif_pfb,
  "pdfjs/standard_fonts/FoxitSerifBold.pfb": font_FoxitSerifBold_pfb,
  "pdfjs/standard_fonts/FoxitSerifBoldItalic.pfb": font_FoxitSerifBoldItalic_pfb,
  "pdfjs/standard_fonts/FoxitSerifItalic.pfb": font_FoxitSerifItalic_pfb,
  "pdfjs/standard_fonts/FoxitSymbol.pfb": font_FoxitSymbol_pfb,
  "pdfjs/standard_fonts/LiberationSans-Bold.ttf": font_LiberationSans_Bold_ttf,
  "pdfjs/standard_fonts/LiberationSans-BoldItalic.ttf": font_LiberationSans_BoldItalic_ttf,
  "pdfjs/standard_fonts/LiberationSans-Italic.ttf": font_LiberationSans_Italic_ttf,
  "pdfjs/standard_fonts/LiberationSans-Regular.ttf": font_LiberationSans_Regular_ttf,
  "pdfjs/wasm/openjpeg.wasm": wasm_openjpeg_wasm,
  "pdfjs/wasm/jbig2.wasm": wasm_jbig2_wasm,
  "pdfjs/wasm/qcms_bg.wasm": wasm_qcms_bg_wasm,
};
