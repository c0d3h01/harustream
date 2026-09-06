// Subtitle format conversion. Browsers only render WebVTT natively, so
// anything a provider serves as SRT or TTML is converted at the proxy
// boundary before it reaches the <video> element's <track>.

function ttmlTime(value: string): number {
  const parts = value.trim().split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}

function formatVttTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${remainder
    .toFixed(3)
    .padStart(6, '0')}`;
}

export function ttmlToVtt(ttml: string): string {
  const cues: string[] = [];
  const paragraphPattern = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
  for (const match of ttml.matchAll(paragraphPattern)) {
    const attributes = match[1];
    const begin = attributes.match(/\bbegin=["']([^"']+)["']/i)?.[1];
    const end = attributes.match(/\bend=["']([^"']+)["']/i)?.[1];
    if (!begin || !end) continue;
    const text = match[2]
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
    cues.push(`${formatVttTime(ttmlTime(begin))} --> ${formatVttTime(ttmlTime(end))}\n${text}`);
  }
  return `WEBVTT\n\n${cues.join('\n\n')}\n`;
}

export function srtToVtt(srt: string): string {
  const cues = srt
    .replace(/^\uFEFF/, '')
    .trim()
    .split(/\r?\n\s*\r?\n/)
    .flatMap((block) => {
      const lines = block.split(/\r?\n/);
      const timingIndex = lines.findIndex((line) => line.includes('-->'));
      if (timingIndex < 0) return [];

      const timing = lines[timingIndex].replace(/,(\d{3})(?=\s|$)/g, '.$1');
      const text = lines
        .slice(timingIndex + 1)
        .join('\n')
        .trim();
      if (!text) return [];
      return [`${timing}\n${text}`];
    });

  return `WEBVTT\n\n${cues.join('\n\n')}\n`;
}
