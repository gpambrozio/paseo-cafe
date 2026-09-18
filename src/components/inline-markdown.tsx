import { Fragment } from "react"
import { parseInlineMarkdown } from "../../plugin/shared/inline-markdown"

/**
 * Renders the inline markdown authors write in catalog text — links, bold,
 * italic, code — instead of printing its syntax. The parse is shared with
 * the Paseo plugin (plugin/shared/inline-markdown.ts), which renders the
 * same segments with React Native primitives.
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
  return (
    <span className={className}>
      {parseInlineMarkdown(text).map((segment, index) => {
        const content = segment.code ? (
          <code className="text-[0.9em]">{segment.text}</code>
        ) : (
          segment.text
        )
        const styled = segment.strong ? (
          <strong className="font-semibold">{content}</strong>
        ) : segment.emphasis ? (
          <em>{content}</em>
        ) : (
          content
        )

        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: Segments are positional — the same text can legitimately repeat.
          <Fragment key={index}>
            {segment.href && links === "anchor" ? (
              <a
                href={segment.href}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-3 hover:text-foreground"
              >
                {styled}
              </a>
            ) : (
              styled
            )}
          </Fragment>
        )
      })}
    </span>
  )
}
