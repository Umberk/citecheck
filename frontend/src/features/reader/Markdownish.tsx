import { Fragment, type ReactNode } from "react";

const BULLET = /^\s*([-*•]|\d+[.)])\s+/;

/** Render model text with paragraphs, bullet lists, and **bold** without a markdown dependency. */
export function Markdownish({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  let paragraph: string[] = [];
  let bullets: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      nodes.push(
        <p key={nodes.length}>
          {paragraph.map((line, index) => (
            <Fragment key={index}>
              {index > 0 && <br />}
              {inline(line.replace(/^#+\s*/, ""))}
            </Fragment>
          ))}
        </p>,
      );
      paragraph = [];
    }
  };
  const flushBullets = () => {
    if (bullets.length) {
      nodes.push(
        <ul key={nodes.length} className="m-0 flex list-disc flex-col gap-1 pl-5">
          {bullets.map((line, index) => (
            <li key={index}>{inline(line)}</li>
          ))}
        </ul>,
      );
      bullets = [];
    }
  };

  for (const line of text.trim().split("\n")) {
    if (!line.trim()) {
      flushParagraph();
      flushBullets();
    } else if (BULLET.test(line)) {
      flushParagraph();
      bullets.push(line.replace(BULLET, ""));
    } else {
      flushBullets();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushBullets();

  return <div className="flex flex-col gap-2">{nodes}</div>;
}

function inline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`"))
      return (
        <code key={index} className="rounded-sm bg-subtle px-1 font-mono text-[0.92em]">
          {part.slice(1, -1)}
        </code>
      );
    return <Fragment key={index}>{part}</Fragment>;
  });
}
