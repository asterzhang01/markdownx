/**
 * Markdown Preview Component
 * Renders Markdown content as formatted HTML using react-markdown
 * Supports GFM, syntax highlighting, and local image resolution
 */
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeHighlight from 'rehype-highlight';

interface MarkdownPreviewProps {
  content: string;
  basePath: string;
}

/**
 * Resolve image path: convert assets/ relative paths to file:// absolute paths
 */
function resolveImagePath(src: string | undefined, basePath: string): string {
  if (!src) {
    console.warn('[MarkdownPreview] Empty image src');
    return '';
  }
  if (
    src.startsWith('http://') ||
    src.startsWith('https://') ||
    src.startsWith('data:')
  ) {
    return src;
  }
  const normalizedSrc = src.startsWith('./') ? src.slice(2) : src;
  const resolvedPath = `file://${basePath}/${normalizedSrc}`;
  console.log('[MarkdownPreview] Resolved image path', { src, resolvedPath });
  return resolvedPath;
}

export function MarkdownPreview({ content, basePath }: MarkdownPreviewProps) {
  console.log('[MarkdownPreview] Rendering preview', { basePath, contentLength: content.length });
  
  return (
    <div className="h-full overflow-auto bg-white">
      <article className="markdown-preview max-w-[722px] mx-auto px-8 py-6">
        <ReactMarkdown
          children={content}
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw, rehypeHighlight]}
          components={{
            img: ({ src, alt, ...props }) => {
              const resolvedSrc = resolveImagePath(src, basePath);
              return (
                <img
                  src={resolvedSrc}
                  alt={alt}
                  className="max-w-full rounded-md border border-gray-200"
                  loading="lazy"
                  {...props}
                />
              );
            },
            code: ({ className, children, ...props }) => {
              const isInline = !className;
              if (isInline) {
                return (
                  <code
                    className="bg-gray-100 px-1.5 py-0.5 rounded text-sm"
                    {...props}
                  >
                    {children}
                  </code>
                );
              }
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            },
            a: ({ href, children, ...props }) => (
              <a
                href={href}
                target={href?.startsWith('http') ? '_blank' : undefined}
                rel={
                  href?.startsWith('http')
                    ? 'noopener noreferrer'
                    : undefined
                }
                {...props}
              >
                {children}
              </a>
            ),
          }}
        />
      </article>
    </div>
  );
}
