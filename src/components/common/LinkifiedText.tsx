import React from 'react';

interface LinkifiedTextProps {
  text: string;
  className?: string;
}

const URL_SPLIT_REGEX = /((?:https?:\/\/|www\.)[^\s<>"']+)/gi;

function splitTrailingPunctuation(rawUrl: string): { url: string; trailing: string } {
  let url = rawUrl;
  let trailing = '';
  while (url.length > 0 && /[.,!?;:'")\]]$/.test(url)) {
    const lastChar = url[url.length - 1];
    // Preserve balanced closing paren if opening paren exists in URL (e.g. Wikipedia links)
    if (lastChar === ')' && (url.match(/\(/g)?.length || 0) >= (url.match(/\)/g)?.length || 0)) {
      break;
    }
    trailing = lastChar + trailing;
    url = url.slice(0, -1);
  }
  return { url, trailing };
}

function toExternalHref(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

export const LinkifiedText: React.FC<LinkifiedTextProps> = ({ text, className = '' }) => {
  if (!text) return null;

  const lines = text.split('\n');

  return (
    <span className={className}>
      {lines.map((line, lineIdx) => {
        const parts = line.split(URL_SPLIT_REGEX);
        return (
          <React.Fragment key={lineIdx}>
            {parts.map((part, partIdx) => {
              if (!part) return null;
              if (/^(?:https?:\/\/|www\.)/i.test(part)) {
                const { url, trailing } = splitTrailingPunctuation(part);
                if (!url) return <React.Fragment key={partIdx}>{part}</React.Fragment>;
                const href = toExternalHref(url);
                return (
                  <React.Fragment key={partIdx}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[var(--color-primary)] hover:underline break-all font-medium cursor-pointer"
                    >
                      {url}
                    </a>
                    {trailing}
                  </React.Fragment>
                );
              }
              return <React.Fragment key={partIdx}>{part}</React.Fragment>;
            })}
            {lineIdx < lines.length - 1 && <br />}
          </React.Fragment>
        );
      })}
    </span>
  );
};
