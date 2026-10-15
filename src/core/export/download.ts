// Saves a file from an extension page. Uses the downloads API so the save
// works from the popup and side panel on every target browser.
import { browser } from 'wxt/browser';

export async function saveFile(name: string, data: BlobPart, mimeType: string): Promise<void> {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  try {
    await browser.downloads.download({ url, filename: name, saveAs: false, conflictAction: 'uniquify' });
  } finally {
    // Give the browser time to start reading the blob before revoking it.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
