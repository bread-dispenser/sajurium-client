import { createElement, Fragment } from "react";
import type { CSSProperties, ReactNode } from "react";

/**
 * A small, safe markdown subset for AI-written answers and previews.
 *
 * Everything becomes React elements or plain strings. Nothing is ever turned into an
 * HTML string, raw HTML tags are removed, and links keep only their text, so remote
 * content cannot inject markup, scripts or navigation.
 */

export type MarkdownInline =
  | { type: "text"; value: string }
  | { type: "strong"; children: MarkdownInline[] }
  | { type: "em"; children: MarkdownInline[] };

/** One visual line of inline content. */
export type MarkdownLine = MarkdownInline[];

export type MarkdownBlock =
  | { type: "heading"; line: MarkdownLine }
  | { type: "paragraph"; lines: MarkdownLine[] }
  | { type: "list"; ordered: boolean; start: number; items: MarkdownLine[][] }
  | { type: "rule" };

const ESCAPED_STAR = "";
const ESCAPED_UNDERSCORE = "";

const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
const EMPTY_HEADING = /^ {0,3}#{1,6}[ \t]*$/;
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const SETEXT_UNDERLINE = /^ {0,3}=+[ \t]*$/;
const BULLET = /^[ \t]*[-*+][ \t]+(.*)$/;
const ORDERED = /^[ \t]*(\d{1,9})[.)][ \t]+(.*)$/;
const QUOTE = /^[ \t]*>[ \t]?/;
const FENCE = /^[ \t]*(```|~~~)/;
const TABLE_DIVIDER = /^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(\|[ \t]*:?-{3,}:?[ \t]*)+\|?[ \t]*$/;
const TABLE_ROW = /^[ \t]*\|(.*)\|[ \t]*$/;
const CONTINUATION = /^(?: {2,}|\t)\S/;

/** Latin letters and digits around "_" mean snake_case, not emphasis. Korean particles may follow "_강조_". */
function isWordChar(char: string | undefined) {
  return Boolean(char) && /[0-9A-Za-z]/.test(char as string);
}

function isSpace(char: string | undefined) {
  return !char || /\s/.test(char);
}

function decodeEntities(text: string) {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Removes inline syntax that must never be interpreted: HTML, links, images and code marks. */
function cleanInlineSource(source: string) {
  return source
    .replace(/\\\*/g, ESCAPED_STAR)
    .replace(/\\_/g, ESCAPED_UNDERSCORE)
    .replace(/\\([\\`{}[\]()#+\-.!>|~])/g, "$1")
    .replace(/(`+)([^`]+?)\1/g, "$2")
    .replace(/!\[([^\]]*)\]\((?:[^()]|\([^)]*\))*\)/g, "$1")
    .replace(/\[([^\]]+)\]\((?:[^()]|\([^)]*\))*\)/g, "$1")
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
    .replace(/<((?:https?|mailto):[^<>\s]*)>/gi, "$1")
    .replace(/<[A-Za-z][A-Za-z0-9+.-]*:[^<>\s]*>/g, "")
    .replace(/<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>]*)?\/?>/g, "")
    .replace(/~~([^~]+)~~/g, "$1");
}

function textNode(value: string): MarkdownInline {
  return { type: "text", value: decodeEntities(value).replace(//g, "*").replace(//g, "_") };
}

function findClosing(source: string, delimiter: string, from: number) {
  const marker = delimiter[0];
  for (let index = from; index < source.length; index += 1) {
    if (!source.startsWith(delimiter, index)) continue;
    if (delimiter.length === 1 && (source[index + 1] === marker || source[index - 1] === marker)) {
      if (source[index + 1] === marker) index += 1;
      continue;
    }
    if (isSpace(source[index - 1])) continue;
    if (marker === "_" && isWordChar(source[index + delimiter.length])) continue;
    return index;
  }
  return -1;
}

function parseEmphasis(source: string): MarkdownInline[] {
  const output: MarkdownInline[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer) output.push(textNode(buffer));
    buffer = "";
  };
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (char !== "*" && char !== "_") {
      buffer += char;
      index += 1;
      continue;
    }
    const delimiter = source[index + 1] === char ? char + char : char;
    const start = index + delimiter.length;
    const canOpen = !isSpace(source[start]) && source[start] !== char && (char !== "_" || !isWordChar(source[index - 1]));
    const close = canOpen ? findClosing(source, delimiter, start + 1) : -1;
    if (close >= 0) {
      flush();
      output.push({ type: delimiter.length === 2 ? "strong" : "em", children: parseEmphasis(source.slice(start, close)) });
      index = close + delimiter.length;
      continue;
    }
    // An unmatched double marker is markdown noise, not text the user should read.
    if (delimiter.length === 2) {
      index += 2;
      continue;
    }
    buffer += char;
    index += 1;
  }
  flush();
  return output;
}

export function parseInline(source: string): MarkdownLine {
  return parseEmphasis(cleanInlineSource(source));
}

function removeDangerousBlocks(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/<!--[\s\S]*?(?:-->|$)/g, "")
    .replace(/<(script|style|iframe|object|noscript|template)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, "");
}

function tableRowText(row: string) {
  return row.split("|").map((cell) => cell.trim()).filter(Boolean).join(", ");
}

/** Parses the supported subset into blocks. Unsupported syntax degrades to plain text. */
export function parseMarkdown(text: string | null | undefined): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; start: number; items: string[][] } | null = null;
  let inFence = false;

  const flushParagraph = () => {
    const lines = paragraph.map(parseInline).filter((line) => plainInline(line).trim());
    if (lines.length) blocks.push({ type: "paragraph", lines });
    paragraph = [];
  };
  const flushList = () => {
    if (list) {
      const items = list.items.map((item) => item.map(parseInline).filter((line) => plainInline(line).trim())).filter((item) => item.length);
      if (items.length) blocks.push({ type: "list", ordered: list.ordered, start: list.start, items });
    }
    list = null;
  };
  const flush = () => {
    flushParagraph();
    flushList();
  };
  const addParagraphLine = (line: string) => {
    flushList();
    paragraph.push(line.trim());
  };

  for (const rawLine of removeDangerousBlocks(text ?? "").split("\n")) {
    if (FENCE.test(rawLine)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      if (rawLine.trim()) addParagraphLine(rawLine);
      else flush();
      continue;
    }

    let line = rawLine;
    while (QUOTE.test(line)) line = line.replace(QUOTE, "");
    if (!line.trim()) {
      flush();
      continue;
    }

    if (SETEXT_UNDERLINE.test(line) && paragraph.length) {
      const title = paragraph.pop() as string;
      flushParagraph();
      blocks.push({ type: "heading", line: parseInline(title) });
      continue;
    }
    if (EMPTY_HEADING.test(line)) continue;
    const heading = line.match(HEADING);
    if (heading) {
      flush();
      const content = parseInline(heading[2]);
      if (plainInline(content).trim()) blocks.push({ type: "heading", line: content });
      continue;
    }
    if (RULE.test(line)) {
      flush();
      if (blocks.length && blocks[blocks.length - 1].type !== "rule") blocks.push({ type: "rule" });
      continue;
    }
    const bullet = line.match(BULLET);
    const ordered = bullet ? null : line.match(ORDERED);
    if (bullet || ordered) {
      flushParagraph();
      const isOrdered = Boolean(ordered);
      const current = list as { ordered: boolean; start: number; items: string[][] } | null;
      if (!current || current.ordered !== isOrdered) {
        flushList();
        list = { ordered: isOrdered, start: ordered ? Number(ordered[1]) : 1, items: [] };
      }
      (list as unknown as { items: string[][] }).items.push([(bullet ? bullet[1] : (ordered as RegExpMatchArray)[2]).trim()]);
      continue;
    }
    if (list && CONTINUATION.test(line)) {
      const items = (list as { items: string[][] }).items;
      items[items.length - 1].push(line.trim());
      continue;
    }
    if (TABLE_DIVIDER.test(line)) continue;
    const row = line.match(TABLE_ROW);
    addParagraphLine(row ? tableRowText(row[1]) : line);
  }
  flush();
  while (blocks.length && blocks[blocks.length - 1].type === "rule") blocks.pop();
  return blocks;
}

export function plainInline(line: MarkdownLine): string {
  return line.map((node) => (node.type === "text" ? node.value : plainInline(node.children))).join("");
}

function blockLines(block: MarkdownBlock): string[] {
  switch (block.type) {
    case "heading":
      return [plainInline(block.line)];
    case "paragraph":
      return block.lines.map(plainInline);
    case "list":
      return block.items.flatMap((item, index) => {
        const lines = item.map(plainInline);
        if (block.ordered) lines[0] = `${block.start + index}. ${lines[0]}`;
        return lines;
      });
    case "rule":
      return [];
  }
}

/** Plain text of one block, with its own line boundaries kept. */
export function blockToPlainText(block: MarkdownBlock): string {
  return blockLines(block).map((line) => line.trim()).filter(Boolean).join("\n");
}

/**
 * Removes markdown syntax but keeps the words, Korean text, list numbers and line
 * boundaries. HTML tags and link targets are dropped.
 */
export function markdownToPlainText(text: string | null | undefined): string {
  return parseMarkdown(text).map(blockToPlainText).filter(Boolean).join("\n");
}

function truncate(text: string, maxLength: number) {
  const chars = Array.from(text);
  if (chars.length <= maxLength) return text;
  const cut = chars.slice(0, Math.max(1, maxLength - 1)).join("");
  const lastSpace = cut.lastIndexOf(" ");
  const trimmed = lastSpace > 0 && lastSpace >= cut.length - 20 ? cut.slice(0, lastSpace) : cut;
  return `${trimmed.replace(/[\s.,;:]+$/, "")}…`;
}

function plainLines(text: string | null | undefined) {
  return markdownToPlainText(text)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/**
 * One-line plain preview: strip markdown first, then collapse whitespace, then truncate,
 * so a cut never lands inside syntax. A line that is followed by another line ends as a
 * sentence, so line boundaries stay readable on a single row.
 */
export function markdownPreview(text: string | null | undefined, maxLength = 120): string {
  const lines = plainLines(text);
  const plain = lines.map((line, index) => (index === lines.length - 1 || /[.!?。…:;,)\]"'”’]$/.test(line) ? line : `${line}.`)).join(" ");
  return truncate(plain, maxLength);
}

/** Plain single-line title: same stripping as markdownPreview, without added punctuation. */
export function markdownTitle(text: string | null | undefined, maxLength = 80): string {
  return truncate(plainLines(text).join(" "), maxLength);
}

function renderInline(line: MarkdownLine, keyPrefix: string): ReactNode[] {
  return line.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    if (node.type === "text") return <Fragment key={key}>{node.value}</Fragment>;
    const Tag = node.type === "strong" ? "strong" : "em";
    return <Tag key={key}>{renderInline(node.children, key)}</Tag>;
  });
}

function renderLines(lines: MarkdownLine[], keyPrefix: string): ReactNode[] {
  return lines.flatMap((line, index) => {
    const content = renderInline(line, `${keyPrefix}-${index}`);
    return index === 0 ? content : [<br key={`${keyPrefix}-br-${index}`} />, ...content];
  });
}

export type MarkdownBlocksProps = {
  blocks: MarkdownBlock[];
  /** Real heading level for markdown headings. Choose the level that keeps the page outline valid. */
  headingLevel?: 3 | 4 | 5 | 6;
  textClassName?: string;
  textStyle?: CSSProperties;
};

export function MarkdownBlocks({ blocks, headingLevel = 3, textClassName = "sj-body", textStyle }: MarkdownBlocksProps) {
  return (
    <>
      {blocks.map((block, index) => {
        const key = `md-${index}`;
        switch (block.type) {
          case "heading":
            return createElement(`h${headingLevel}`, { key, className: "sj-h3" }, renderInline(block.line, key));
          case "paragraph":
            return <p key={key} className={textClassName} style={textStyle}>{renderLines(block.lines, key)}</p>;
          case "list": {
            const items = block.items.map((item, itemIndex) => <li key={`${key}-${itemIndex}`} className="sj-md-item">{renderLines(item, `${key}-${itemIndex}`)}</li>);
            const className = `${textClassName} sj-md-list`;
            return block.ordered
              ? <ol key={key} className={className} style={textStyle} start={block.start === 1 ? undefined : block.start}>{items}</ol>
              : <ul key={key} className={className} style={textStyle}>{items}</ul>;
          }
          case "rule":
            return <hr key={key} className="sj-md-rule" />;
        }
      })}
    </>
  );
}

export function Markdown({ text, ...props }: Omit<MarkdownBlocksProps, "blocks"> & { text: string }) {
  return <MarkdownBlocks blocks={parseMarkdown(text)} {...props} />;
}
