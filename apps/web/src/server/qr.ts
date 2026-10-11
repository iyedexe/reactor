import "server-only";
import QRCode from "qrcode";

/** QR code as an SVG string (vector, prints sharp at any size). */
export function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#000000", light: "#ffffff" } });
}
