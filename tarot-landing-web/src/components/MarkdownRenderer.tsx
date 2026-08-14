import React from "react";
import "../styles/glass.css";

interface MarkdownRendererProps {
  content: string;
}

type InlineToken =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "italic"; text: string }
  | { type: "code"; text: string }
  | { type: "link"; text: string; href: string };

function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let i = 0;
  let buffer = "";
  while (i < text.length) {
    if (text.startsWith("**", i) || text.startsWith("__", i)) {
      if (buffer) { tokens.push({ type: "text", text: buffer }); buffer = ""; }
      const end = text.indexOf(text[i] === "*" ? "**" : "__", i + 2);
      if (end === -1) { buffer += text[i]; i++; continue; }
      tokens.push({ type: "bold", text: text.slice(i + 2, end) });
      i = end + 2;
    } else if (text[i] === "*" || text[i] === "_") {
      if (buffer) { tokens.push({ type: "text", text: buffer }); buffer = ""; }
      const end = text.indexOf(text[i], i + 1);
      if (end === -1) { buffer += text[i]; i++; continue; }
      tokens.push({ type: "italic", text: text.slice(i + 1, end) });
      i = end + 1;
    } else if (text.startsWith("`", i)) {
      if (buffer) { tokens.push({ type: "text", text: buffer }); buffer = ""; }
      const end = text.indexOf("`", i + 1);
      if (end === -1) { buffer += text[i]; i++; continue; }
      tokens.push({ type: "code", text: text.slice(i + 1, end) });
      i = end + 1;
    } else if (text.startsWith("[", i)) {
      if (buffer) { tokens.push({ type: "text", text: buffer }); buffer = ""; }
      const closeBracket = text.indexOf("](", i);
      const closeParen = closeBracket !== -1 ? text.indexOf(")", closeBracket + 2) : -1;
      if (closeBracket === -1 || closeParen === -1) { buffer += text[i]; i++; continue; }
      tokens.push({ type: "link", text: text.slice(i + 1, closeBracket), href: text.slice(closeBracket + 2, closeParen) });
      i = closeParen + 1;
    } else {
      buffer += text[i];
      i++;
    }
  }
  if (buffer) tokens.push({ type: "text", text: buffer });
  return tokens;
}

function renderInline(tokens: InlineToken[], keyPrefix: string): React.ReactNode[] {
  return tokens.map((t, i) => {
    const key = `${keyPrefix}-${i}`;
    switch (t.type) {
      case "bold": return <strong key={key} className="font-semibold" style={{ color: "var(--gl-text)" }}>{t.text}</strong>;
      case "italic": return <em key={key} className="italic" style={{ color: "var(--gl-text)" }}>{t.text}</em>;
      case "code": return <code key={key} className="px-2 py-0.5 rounded-md text-sm font-mono" style={{ backgroundColor: "var(--gl-glass)", color: "var(--gl-accent)", border: "1px solid var(--gl-hair)" }}>{t.text}</code>;
      case "link": return <a key={key} href={t.href} target="_blank" rel="noopener noreferrer" className="underline decoration-1 underline-offset-2 transition-colors" style={{ color: "var(--gl-accent)" }}>{t.text}</a>;
      default: return <React.Fragment key={key}>{t.text}</React.Fragment>;
    }
  });
}

interface TableSection {
  type: "table";
  headers: string[];
  rows: string[][];
}

type Block = 
  | { type: "h1" | "h2" | "h3" | "h4" | "p" | "blockquote" | "hr" | "code"; text: string; lang?: string }
  | { type: "ul" | "ol"; items: string[] }
  | TableSection;

function parseMarkdown(content: string): Block[] {
  const lines = content.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("# ")) {
      blocks.push({ type: "h1", text: line.slice(2).trim() });
      i++;
    } else if (line.startsWith("## ")) {
      blocks.push({ type: "h2", text: line.slice(3).trim() });
      i++;
    } else if (line.startsWith("### ")) {
      blocks.push({ type: "h3", text: line.slice(4).trim() });
      i++;
    } else if (line.startsWith("#### ")) {
      blocks.push({ type: "h4", text: line.slice(5).trim() });
      i++;
    } else if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push({ type: "code", text: codeLines.join("\n"), lang: lang || undefined });
      i++;
    } else if (line.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      blocks.push({ type: "blockquote", text: quoteLines.join("\n") });
    } else if (/^-{3,}$/.test(line.trim())) {
      blocks.push({ type: "hr", text: "" });
      i++;
    } else if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
      const items: string[] = [];
      while (i < lines.length && (lines[i].trim().startsWith("- ") || lines[i].trim().startsWith("* "))) {
        items.push(lines[i].trim().slice(2));
        i++;
      }
      blocks.push({ type: "ul", items });
    } else if (/^\d+\.\s/.test(line.trim())) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s/, ""));
        i++;
      }
      blocks.push({ type: "ol", items });
    } else if (line.trim().startsWith("|")) {
      const headers = line.split("|").filter(Boolean).map(s => s.trim());
      i++;
      i++;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(lines[i].split("|").filter(Boolean).map(s => s.trim()));
        i++;
      }
      blocks.push({ type: "table" as const, headers, rows });
    } else if (line.trim() === "") {
      i++;
    } else {
      const paraLines: string[] = [];
      while (i < lines.length && lines[i].trim() !== "") {
        paraLines.push(lines[i].trim());
        i++;
      }
      blocks.push({ type: "p", text: paraLines.join(" ") });
    }
  }
  return blocks;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  const blocks = parseMarkdown(content);

  const renderBlock = (block: Block, idx: number): React.ReactNode => {
    const key = `block-${idx}`;
    switch (block.type) {
      case "h1":
        return <h1 key={key} className="gl-h2 mt-12 mb-6">{renderInline(parseInline(block.text), key)}</h1>;
      case "h2":
        return <h2 key={key} className="gl-h3 mt-10 mb-4">{renderInline(parseInline(block.text), key)}</h2>;
      case "h3":
        return <h3 key={key} className="gl-serif mt-8 mb-3" style={{ color: "var(--gl-text)", fontSize: 20, fontWeight: 400, letterSpacing: "-0.2px" }}>{renderInline(parseInline(block.text), key)}</h3>;
      case "h4":
        return <h4 key={key} className="uppercase mt-6 mb-2" style={{ color: "var(--gl-text-faint)", fontFamily: "var(--gl-sans)", fontSize: 11.5, fontWeight: 600, letterSpacing: "2px" }}>{renderInline(parseInline(block.text), key)}</h4>;
      case "p":
        return <p key={key} className="text-base leading-relaxed mb-4" style={{ color: "var(--gl-text-dim)" }}>{renderInline(parseInline(block.text), key)}</p>;
      case "blockquote":
        return <blockquote key={key} className="pl-6 py-3 my-6 rounded-r-2xl border-l-2" style={{ borderColor: "var(--gl-accent-dim)", backgroundColor: "var(--gl-glass)" }}><div className="text-base leading-relaxed italic" style={{ color: "var(--gl-text-dim)" }}>{renderInline(parseInline(block.text), key)}</div></blockquote>;
      case "hr":
        return <hr key={key} className="gl-divider my-10 border-0" />;
      case "code":
        return (
          <div key={key} className="relative group my-6 rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--gl-glass)", border: "1px solid var(--gl-hair-soft)" }}>
            <div className="flex items-center gap-2 px-5 py-3 border-b" style={{ borderColor: "var(--gl-hair-soft)", backgroundColor: "var(--gl-glass)" }}>
              <div className="flex gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500/60" /><span className="w-3 h-3 rounded-full bg-yellow-500/60" /><span className="w-3 h-3 rounded-full bg-green-500/60" /></div>
              <span className="text-[10px] font-mono uppercase tracking-widest ml-2" style={{ color: "var(--gl-text-faint)" }}>{block.lang || "code"}</span>
            </div>
            <pre className="p-5 overflow-x-auto"><code className="text-sm font-mono leading-relaxed" style={{ color: "var(--gl-text-dim)" }}>{block.text}</code></pre>
          </div>
        );
      case "ul":
        return (
          <ul key={key} className="space-y-2 mb-4 ml-6">
            {block.items.map((item, j) => (
              <li key={`${key}-li-${j}`} className="text-base leading-relaxed pl-2" style={{ color: "var(--gl-text-dim)" }}>
                <span className="inline-block mr-2" style={{ color: "var(--gl-accent)" }}>✦</span>
                {renderInline(parseInline(item), `${key}-${j}`)}
              </li>
            ))}
          </ul>
        );
      case "ol":
        return (
          <ol key={key} className="space-y-2 mb-4 ml-6 list-decimal" style={{ color: "var(--gl-text-dim)" }}>
            {block.items.map((item, j) => (
              <li key={`${key}-li-${j}`} className="text-base leading-relaxed pl-2" style={{ color: "var(--gl-text-dim)" }}>
                {renderInline(parseInline(item), `${key}-${j}`)}
              </li>
            ))}
          </ol>
        );
      case "table":
        return (
          <div key={key} className="my-6 rounded-2xl overflow-hidden border" style={{ borderColor: "var(--gl-hair)" }}>
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: "var(--gl-glass)" }}>
                <tr>{block.headers.map((h, j) => <th key={`${key}-th-${j}`} className="px-5 py-3 text-left font-semibold uppercase tracking-wider text-[10px]" style={{ color: "var(--gl-text-faint)", borderBottom: "1px solid var(--gl-hair)" }}>{renderInline(parseInline(h), `${key}-th-${j}`)}</th>)}</tr>
              </thead>
              <tbody>
                {block.rows.map((row, j) => (
                  <tr key={`${key}-tr-${j}`}>{row.map((cell, k) => <td key={`${key}-td-${j}-${k}`} className="px-5 py-3" style={{ color: "var(--gl-text-dim)", borderBottom: "1px solid var(--gl-hair-soft)" }}>{renderInline(parseInline(cell), `${key}-td-${j}-${k}`)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        );
    }
  };

  return <div className="markdown-body" style={{ fontFamily: "var(--gl-sans)" }}>{blocks.map(renderBlock)}</div>;
};

export default MarkdownRenderer;
