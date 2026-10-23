export function roomUrl(code: string): string {
  if (typeof window === 'undefined') return `/room/${code}`;
  return `${window.location.origin}/room/${code}`;
}

export function inviteText(name: string, code: string, url: string, language: 'bn' | 'en'): string {
  if (language === 'bn') {
    return `${name} তোমাকে চোর পুলিশ খেলতে ডাকছে!\nচারজন, একটি টেবিল, অনেক ভাঁজ করা কাগজ।\nরুম কোড: ${code}\n${url}`;
  }
  return `${name} is calling you for a game of Chor Police!\nFour friends, one table, lots of folded paper.\nRoom code: ${code}\n${url}`;
}

export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function telegramUrl(text: string, url: string): string {
  return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
}

export function messengerUrl(url: string): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
}

export function canNativeShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

export async function nativeShare(data: ShareData): Promise<'shared' | 'cancelled' | 'unsupported'> {
  if (!canNativeShare()) return 'unsupported';
  try {
    await navigator.share(data);
    return 'shared';
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    return 'unsupported';
  }
}

export function canShareFiles(): boolean {
  if (!canNativeShare()) return false;
  return typeof navigator.canShare === 'function';
}

export async function shareFile(file: File, title: string, text: string): Promise<'shared' | 'cancelled' | 'unsupported'> {
  if (!canNativeShare()) return 'unsupported';
  try {
    if (typeof navigator.canShare === 'function' && !navigator.canShare({ files: [file] })) {
      return 'unsupported';
    }
    await navigator.share({ title, text, files: [file] });
    return 'shared';
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    return 'unsupported';
  }
}
