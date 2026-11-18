'use client';

import React, { useState, useMemo, useCallback } from 'react';
import Prism from 'prismjs';
import { Copy, Check } from '@phosphor-icons/react';

// Load Prism language components in order of dependency
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-bash';

/**
 * Normalized mapping of language identifiers and aliases
 */
const LANGUAGE_ALIASES: Record<string, string> = {
  js: 'javascript',
  javascript: 'javascript',
  ts: 'typescript',
  typescript: 'typescript',
  html: 'markup',
  xml: 'markup',
  markup: 'markup',
  svg: 'markup',
  css: 'css',
  py: 'python',
  python: 'python',
  java: 'java',
  json: 'json',
  sql: 'sql',
  sh: 'bash',
  bash: 'bash',
  shell: 'bash',
  zsh: 'bash',
};

/**
 * Human-readable display labels for language badges
 */
const LANGUAGE_LABELS: Record<string, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  markup: 'HTML',
  css: 'CSS',
  python: 'Python',
  java: 'Java',
  json: 'JSON',
  sql: 'SQL',
  bash: 'Bash',
  text: 'Code',
  plain: 'Code',
};

/**
 * Normalizes user-supplied or detected language string to a supported Prism grammar key
 */
export function normalizeLanguage(lang?: string): string {
  if (!lang) return '';
  const lower = lang.trim().toLowerCase();
  return LANGUAGE_ALIASES[lower] || lower;
}

/**
 * Returns formatted label for language pill badge
 */
export function getLanguageLabel(lang: string): string {
  const normalized = normalizeLanguage(lang);
  if (LANGUAGE_LABELS[normalized]) {
    return LANGUAGE_LABELS[normalized];
  }
  if (!normalized || normalized === 'text' || normalized === 'plain') {
    return 'Code';
  }
  return lang.charAt(0).toUpperCase() + lang.slice(1);
}

/**
 * Auto-detect programming language for common snippet types
 */
export function detectLanguage(code: string): string {
  const trimmed = code.trim();
  if (!trimmed) return 'text';

  // 1. JSON
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // not strict JSON, fall through
    }
  }

  // 2. HTML / XML / Markup
  if (
    /^<!DOCTYPE\s+html/i.test(trimmed) ||
    /<html[\s>]/i.test(trimmed) ||
    /<\/?[a-z][a-z0-9]*(\s+[^>]+)?>[\s\S]*<\/[a-z][a-z0-9]*>/i.test(trimmed) ||
    /<\/(?:div|span|p|a|ul|ol|li|table|tr|td|th|form|button|h[1-6]|header|footer|section|main|nav|body|head|script|style)>/i.test(trimmed)
  ) {
    return 'markup';
  }

  // 3. Bash / Shell
  if (
    /^#!\s*\/(?:usr\/)?bin\/(?:env\s+)?(?:bash|sh|zsh)/m.test(trimmed) ||
    /^\s*(?:npm|pnpm|yarn|bun|npx)\s+(?:run|install|add|test|build|dev|exec|start)\b/m.test(trimmed) ||
    /^\s*(?:git|docker|kubectl|curl|wget|chmod|chown|mkdir|rm\s+-rf|export\s+[A-Z_]+=|cat\s+<<|grep|sudo\s+)\b/m.test(trimmed) ||
    /^\$\s+[a-z]/m.test(trimmed)
  ) {
    return 'bash';
  }

  // 4. SQL
  if (
    /\b(?:SELECT\s+[\s\S]+?\s+FROM|INSERT\s+INTO\s+\w+|UPDATE\s+\w+\s+SET|DELETE\s+FROM\s+\w+|CREATE\s+TABLE\s+\w+|ALTER\s+TABLE\s+\w+|DROP\s+TABLE\s+\w+)\b/i.test(trimmed)
  ) {
    return 'sql';
  }

  // 5. Java
  if (
    /\b(?:public|private|protected)\s+(?:static\s+)?(?:final\s+)?(?:class|interface|void|int|double|String|boolean)\b/.test(trimmed) ||
    /\bSystem\.out\.print(?:ln)?\(/.test(trimmed) ||
    /\b(?:package|import)\s+java[a-z0-9_.]*;/i.test(trimmed)
  ) {
    return 'java';
  }

  // 6. Python
  if (
    /\b(?:def\s+\w+\s*\(|class\s+\w+(?:\([^)]*\))?\s*:|import\s+[\w.]+(?:\s+as\s+\w+)?|from\s+[\w.]+\s+import|if\s+__name__\s*==\s*['"]__main__['"]|elif\s+[^:]+:|self\.\w+|print\s*\()/m.test(trimmed) &&
    !/[;{}]/.test(trimmed)
  ) {
    return 'python';
  }

  // 7. CSS
  if (
    /(?:^[.#]?[a-zA-Z0-9_-]+\s*\{[^}]*:\s*[^;]+;\s*\})/m.test(trimmed) ||
    /@(?:media|keyframes|charset|import)\b/.test(trimmed) ||
    /\b(?:display|margin|padding|background-color|border-radius|box-sizing)\s*:\s*[^;]+;/i.test(trimmed)
  ) {
    return 'css';
  }

  // 8. TypeScript
  if (
    /\b(?:interface\s+[A-Z]\w*|type\s+[A-Z]\w*\s*=|:\s*(?:string|number|boolean|unknown|never|any|void)\b|<[A-Z]\w*(?:\s+extends\s+\w+)?>(?=\()|as\s+const\b)/m.test(trimmed)
  ) {
    return 'typescript';
  }

  // 9. JavaScript
  if (
    /\b(?:const|let|var|function|return|console\.(?:log|error|warn)|=>|async\s+function|export\s+(?:default|const|function))\b/.test(trimmed)
  ) {
    return 'javascript';
  }

  return 'text';
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Highlights a snippet of code using Prism, falling back to escaped plaintext
 */
export function highlightCode(code: string, language: string): string {
  const normLang = normalizeLanguage(language);
  const grammar = Prism.languages[normLang];
  if (grammar) {
    try {
      return Prism.highlight(code, grammar, normLang);
    } catch {
      return escapeHtml(code);
    }
  }
  return escapeHtml(code);
}

export interface CodeBlockProps {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
  className?: string;
  title?: string;
}

/**
 * High-fidelity code block component with syntax highlighting, language badge,
 * copy-to-clipboard button, and line numbers gutter for multiline snippets.
 */
export function CodeBlock({
  code,
  language,
  showLineNumbers,
  className,
  title,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  // Normalize code line endings
  const cleanCode = useMemo(() => {
    return code ? code.replace(/\r\n/g, '\n') : '';
  }, [code]);

  // Determine language (auto-detect if missing or 'auto')
  const resolvedLang = useMemo(() => {
    if (language && language.trim() && language.trim().toLowerCase() !== 'auto') {
      return normalizeLanguage(language);
    }
    return detectLanguage(cleanCode);
  }, [language, cleanCode]);

  // Syntax highlighted HTML via Prism
  const highlightedHtml = useMemo(() => {
    return highlightCode(cleanCode, resolvedLang);
  }, [cleanCode, resolvedLang]);

  // Calculate lines for line numbers gutter
  const lines = useMemo(() => {
    const codeForLines = cleanCode.endsWith('\n') ? cleanCode.slice(0, -1) : cleanCode;
    return codeForLines.split('\n');
  }, [cleanCode]);

  const hasMultipleLines = lines.length > 1;
  const displayLineNumbers = showLineNumbers !== undefined ? showLineNumbers : hasMultipleLines;
  const langLabel = getLanguageLabel(resolvedLang);

  const handleCopy = useCallback(async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(cleanCode);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = cleanCode;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code to clipboard', err);
    }
  }, [cleanCode]);

  return (
    <div className={`quiz-code-block ${className || ''}`}>
      <div className="quiz-code-header">
        <div className="quiz-code-header-left">
          <span className="quiz-code-lang" data-language={resolvedLang}>
            {langLabel}
          </span>
          {title ? <span className="quiz-code-title">{title}</span> : null}
        </div>
        <button
          type="button"
          className={`quiz-code-copy-btn ${copied ? 'copied' : ''}`}
          onClick={handleCopy}
          aria-label={copied ? 'Đã sao chép mã nguồn' : 'Sao chép mã nguồn'}
          title={copied ? 'Đã sao chép!' : 'Sao chép mã nguồn'}
        >
          {copied ? <Check size={14} weight="bold" /> : <Copy size={14} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <div className="quiz-code-body">
        {displayLineNumbers && (
          <div className="quiz-code-gutter" aria-hidden="true">
            {lines.map((_, i) => (
              <span key={i + 1} className="quiz-code-line-number">
                {i + 1}
              </span>
            ))}
          </div>
        )}
        <pre className="quiz-code-pre">
          <code
            className={`language-${resolvedLang}`}
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
        </pre>
      </div>
    </div>
  );
}

export interface FormattedTextProps {
  text?: string | null;
  className?: string;
  as?: 'span' | 'div' | 'p';
}

/**
 * Helper component that parses markdown-style inline code (`code`) and
 * fenced code blocks (```code```) within question texts and explanations.
 */
export function FormattedText({
  text,
  className,
  as: Component = 'span',
}: FormattedTextProps) {
  if (!text) return null;

  // Split by fenced code blocks (```lang? ... ```)
  const parts = text.split(/(```[\s\S]*?```)/g);

  return (
    <Component className={className}>
      {parts.map((part, index) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          const content = part.slice(3, -3);
          const firstNewline = content.indexOf('\n');
          let lang = '';
          let code = content;
          if (firstNewline !== -1) {
            lang = content.slice(0, firstNewline).trim();
            code = content.slice(firstNewline + 1);
          }
          return (
            <CodeBlock
              key={index}
              code={code.trimEnd()}
              language={lang || undefined}
            />
          );
        }

        // Parse inline code wrapped in backticks `code`
        const inlineSegments = part.split(/(`[^`\n]+`)/g);
        return (
          <React.Fragment key={index}>
            {inlineSegments.map((segment, segIdx) => {
              if (
                segment.startsWith('`') &&
                segment.endsWith('`') &&
                segment.length >= 2
              ) {
                const inlineCode = segment.slice(1, -1);
                return (
                  <code key={segIdx} className="quiz-inline-code">
                    {inlineCode}
                  </code>
                );
              }
              return segment;
            })}
          </React.Fragment>
        );
      })}
    </Component>
  );
}

export default CodeBlock;
