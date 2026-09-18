import type { PluginTheme } from "@getpaseo/plugin"
import { useMemo } from "react"
import { Text, type TextStyle } from "react-native"
import { parseInlineMarkdown } from "../shared/inline-markdown"
import { openExternal } from "./web"

interface InlineMarkdownProps {
  text: string
  theme: PluginTheme
  /** Base text style; segment styling layers on top of it. */
  style: TextStyle
  /**
   * "text" keeps link labels as unpressable text, for rows that are
   * themselves one big Pressable — there, a nested press target would
   * steal the row's own tap and send the reader somewhere they didn't aim.
   */
  links?: "press" | "text"
  numberOfLines?: number
}

/**
 * Renders the inline markdown authors write in catalog text — links, bold,
 * italic, code — instead of printing its syntax. Shares its parse with the
 * paseo.cafe website (../shared/inline-markdown.ts), which renders the same
 * segments as DOM nodes in src/components/inline-markdown.tsx.
 */
export function InlineMarkdown({
  text,
  theme,
  style,
  links = "press",
  numberOfLines,
}: InlineMarkdownProps) {
  const segments = useMemo(() => parseInlineMarkdown(text), [text])
  const styles = useMemo(
    () => ({
      link: {
        color: theme.colors.accent,
        textDecorationLine: "underline" as const,
      },
      code: { backgroundColor: theme.colors.surface2 },
      strong: { fontWeight: "700" as const },
      emphasis: { fontStyle: "italic" as const },
    }),
    [theme]
  )

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {segments.map((segment, index) => {
        const href = links === "press" ? segment.href : undefined
        return (
          <Text
            // biome-ignore lint/suspicious/noArrayIndexKey: Segments are positional — the same text can legitimately repeat.
            key={index}
            style={[
              segment.code ? styles.code : null,
              segment.strong ? styles.strong : null,
              segment.emphasis ? styles.emphasis : null,
              href ? styles.link : null,
            ]}
            accessibilityRole={href ? "link" : undefined}
            onPress={href ? () => openExternal(href) : undefined}
          >
            {segment.text}
          </Text>
        )
      })}
    </Text>
  )
}
