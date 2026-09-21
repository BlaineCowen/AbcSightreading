/**
 * Save a file the page made, through a hidden link with a `download` name.
 *
 * The object URL is revoked a while later rather than straight after the
 * click: Safari starts the download asynchronously, and revoking at once hands
 * it a dead URL.
 */
export function downloadFile(data: BlobPart, name: string, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
