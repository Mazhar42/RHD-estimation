const BENGALI_FONT_NAME = "NotoSansBengali.ttf";
const BENGALI_FONT_FAMILY = "noto-sans-bengali";
const BENGALI_FONT_URL = new URL(
  "../assets/fonts/NotoSansBengali.ttf",
  import.meta.url,
).href;

let banglaFontBase64Promise = null;

const arrayBufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

const loadBanglaFontBase64 = async () => {
  if (!banglaFontBase64Promise) {
    banglaFontBase64Promise = fetch(BENGALI_FONT_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to load Bengali font asset.");
        }
        return response.arrayBuffer();
      })
      .then(arrayBufferToBase64);
  }
  return banglaFontBase64Promise;
};

export const ensurePdfFont = async (doc, fontFamily) => {
  if (fontFamily !== BENGALI_FONT_FAMILY) {
    return fontFamily;
  }

  const base64 = await loadBanglaFontBase64();
  doc.addFileToVFS(BENGALI_FONT_NAME, base64);
  doc.addFont(BENGALI_FONT_NAME, BENGALI_FONT_FAMILY, "normal");
  doc.addFont(BENGALI_FONT_NAME, BENGALI_FONT_FAMILY, "bold");
  return BENGALI_FONT_FAMILY;
};

export const resolvePdfFontFamily = (fontFamily) => {
  if (!fontFamily) return "helvetica";
  return fontFamily;
};
