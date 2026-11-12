/** Extracts the authored rule body from a board export; metadata stays in provenance storage. */
export class SourceDocumentText {
  static body(text: string): string {
    const marker = 'ТЕКСТ НА ДОСКЕ';
    const body = text.includes(marker) ? text.slice(text.indexOf(marker) + marker.length) : text;
    return body.split('ИЗОБРАЖЕНИЯ В ЭТОМ БЛОКЕ')[0]?.trim() ?? '';
  }
}
