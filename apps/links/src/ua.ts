export type DeviceType = "MOBILE" | "TABLET" | "DESKTOP" | "OTHER";

/** Link-preview fetchers and crawlers: they must not count as scans. */
const BOT = /bot|crawler|spider|preview|facebookexternalhit|whatsapp|telegram|slack|discord|skype|curl|wget|python-requests|undici|node-fetch|axios|go-http|headless|lighthouse|uptime|monitor/i;

export function isBot(ua: string | undefined): boolean {
  return !ua || BOT.test(ua);
}

export function parseUserAgent(ua: string | undefined): { deviceType: DeviceType; os: string | null } {
  if (!ua) return { deviceType: "OTHER", os: null };
  const os = /iPhone|iPad|iPod/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : null;
  const deviceType: DeviceType = /iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))
    ? "TABLET"
    : /Mobi|iPhone|iPod|Android/.test(ua)
      ? "MOBILE"
      : os
        ? "DESKTOP"
        : "OTHER";
  return { deviceType, os };
}
