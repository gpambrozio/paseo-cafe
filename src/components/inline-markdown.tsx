import { Fragment, type ReactNode, useMemo } from "react"
import type { InlineMarkdownTextNode } from "../../plugin/shared/inline-markdown"
import { parseInlineMarkdown } from "../../plugin/shared/inline-markdown"

/**
 * Renders the inline markdown authors write in catalog text — links, bold,
 * italic, code — instead of printing its syntax. The parse is shared with
 * the Paseo plugin (plugin/shared/inline-markdown.ts), which renders the
 * same nodes with React Native primitives.
 *
 * `links="text"` keeps link labels as plain text, for the cards and rows
 * that are themselves one big <Link>: an anchor inside an anchor is invalid
 * HTML, and the whole card already has a destination.
 */
export function InlineMarkdown({
  text,
  links = "anchor",
  className,
}: {
  text: string
  links?: "anchor" | "text"
  className?: string
}) {
  const nodes = useMemo(() => parseInlineMarkdown(text), [text])

  return (
    <span className={className}>
      {nodes.map((node, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: Nodes are positional — the same text can legitimately repeat.
        <Fragment key={index}>
          {node.type === "text" ? (
            <TextRun node={node} />
          ) : links === "anchor" ? (
            // One anchor per link, however many styled runs its label holds.
            <a
              href={node.href}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-3 hover:text-foreground"
            >
              <TextRuns nodes={node.children} />
            </a>
          ) : (
            <TextRuns nodes={node.children} />
          )}
        </Fragment>
      ))}
    </span>
  )
}

function TextRuns({ nodes }: { nodes: readonly InlineMarkdownTextNode[] }) {
  return nodes.map((node, index) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: Nodes are positional — the same text can legitimately repeat.
    <TextRun key={index} node={node} />
  ))
}

function TextRun({ node }: { node: InlineMarkdownTextNode }) {
  let content: ReactNode = node.code ? (
    <code className="text-[0.9em]">{node.text}</code>
  ) : (
    node.text
  )
  // `***both***` is strong *and* emphasized, so these nest rather than pick.
  if (node.emphasis) content = <em>{content}</em>
  if (node.strong)
    content = <strong className="font-semibold">{content}</strong>
  return <>{content}</>
}
