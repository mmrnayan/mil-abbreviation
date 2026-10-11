import { Capacitor } from "@capacitor/core";
export async function downloadJson(value: unknown, filename: string) {
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const file = await Filesystem.writeFile({ path: filename, data: JSON.stringify(value, null, 2), directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: "Abbreviation reports", files: [file.uri] });
    return;
  }
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
