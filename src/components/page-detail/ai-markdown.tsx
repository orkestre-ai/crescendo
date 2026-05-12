'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './ai-markdown.css';

interface AIMarkdownProps {
  content: string;
}

export function AIMarkdown({ content }: AIMarkdownProps) {
  return (
    <div className="ai-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
