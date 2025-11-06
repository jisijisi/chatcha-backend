// Markdown Parsing and Syntax Highlighting
import { escapeHtml, convertEmojiPlaceholders } from './utils.js';

export class MarkdownParser {
  constructor() {
    this.markdownCache = new Map();
    this.highlightObserver = null;
  }

  parseMarkdown(text) {
    // Cache for parsed markdown
    const cacheKey = text.substring(0, 100);
    if (this.markdownCache.has(cacheKey) && this.markdownCache.get(cacheKey).full === text) {
      return this.markdownCache.get(cacheKey).result;
    }

    text = convertEmojiPlaceholders(text);
    let html = escapeHtml(text);
    
    // Extract code blocks
    const codeBlocks = [];
    html = html.replace(/```(\w+)?\n?([\s\S]*?)```/g, (match, language, code) => {
      const placeholder = `__CODEBLOCK_${codeBlocks.length}__`;
      const lang = language || 'plaintext';
      const escapedCode = code.trim();
      codeBlocks.push({
        html: `<pre><code class="language-${lang}">${escapedCode}</code></pre>`,
        language: lang,
        code: escapedCode
      });
      return placeholder;
    });
    
    // Extract inline code
    const inlineCodes = [];
    html = html.replace(/`([^`\n]+)`/g, (match, code) => {
      const placeholder = `__INLINECODE_${inlineCodes.length}__`;
      inlineCodes.push(`<code>${code}</code>`);
      return placeholder;
    });
    
    // Process lines
    let lines = html.split('\n');
    let processedLines = [];
    let inList = false;
    let listType = null;
    let listItems = [];
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      const trimmedLine = line.trim();
      
      // Headers
      if (trimmedLine.match(/^#{1,4} /)) {
        if (inList) {
          processedLines.push(this.wrapList(listItems, listType));
          listItems = [];
          inList = false;
        }
        const level = trimmedLine.match(/^#+/)[0].length;
        const content = trimmedLine.replace(/^#+\s+/, '');
        processedLines.push(`<h${level}>${content}</h${level}>`);
        continue;
      }
      
      // Unordered lists
      if (trimmedLine.match(/^[-*+]\s+/)) {
        const content = trimmedLine.replace(/^[-*+]\s+/, '');
        if (!inList || listType !== 'ul') {
          if (inList) {
            processedLines.push(this.wrapList(listItems, listType));
            listItems = [];
          }
          inList = true;
          listType = 'ul';
        }
        listItems.push(content);
        continue;
      }
      
      // Ordered lists
      if (trimmedLine.match(/^\d+\.\s+/)) {
        const content = trimmedLine.replace(/^\d+\.\s+/, '');
        if (!inList || listType !== 'ol') {
          if (inList) {
            processedLines.push(this.wrapList(listItems, listType));
            listItems = [];
          }
          inList = true;
          listType = 'ol';
        }
        listItems.push(content);
        continue;
      }
      
      // Blockquotes
      if (trimmedLine.match(/^&gt;\s/)) {
        if (inList) {
          processedLines.push(this.wrapList(listItems, listType));
          listItems = [];
          inList = false;
        }
        const content = trimmedLine.replace(/^&gt;\s+/, '');
        processedLines.push(`<blockquote>${content}</blockquote>`);
        continue;
      }
      
      // Horizontal rules
      if (trimmedLine.match(/^(---|\*\*\*|___)$/)) {
        if (inList) {
          processedLines.push(this.wrapList(listItems, listType));
          listItems = [];
          inList = false;
        }
        processedLines.push('<hr>');
        continue;
      }
      
      // Empty lines
      if (trimmedLine === '') {
        if (inList) {
          processedLines.push(this.wrapList(listItems, listType));
          listItems = [];
          inList = false;
        }
        processedLines.push('');
      } else {
        if (inList) {
          processedLines.push(this.wrapList(listItems, listType));
          listItems = [];
          inList = false;
        }
        processedLines.push(line);
      }
    }
    
    if (inList) {
      processedLines.push(this.wrapList(listItems, listType));
    }
    
    html = processedLines.join('\n');
    
    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
    
    // Italic
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/_(.+?)_/g, '<em>$1</em>');
    
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    
    // Restore inline code
    inlineCodes.forEach((code, i) => {
      html = html.replace(`__INLINECODE_${i}__`, code);
    });
    
    // Restore code blocks
    codeBlocks.forEach((block, i) => {
      html = html.replace(`__CODEBLOCK_${i}__`, block.html);
    });
    
    // Wrap in paragraphs
    const paragraphs = html.split(/\n\n+/);
    html = paragraphs.map(para => {
      para = para.trim();
      if (para.match(/^<(pre|ul|ol|h[1-4]|blockquote|hr)/)) {
        return para;
      }
      para = para.replace(/\n/g, '<br>');
      return para ? `<p>${para}</p>` : '';
    }).join('');
    
    // Store in cache
    if (this.markdownCache.size > 50) {
      const firstKey = this.markdownCache.keys().next().value;
      this.markdownCache.delete(firstKey);
    }
    this.markdownCache.set(cacheKey, { full: text, result: html });
    return html;
  }

  wrapList(items, type) {
    if (items.length === 0) return '';
    const listItems = items.map(item => `<li>${item}</li>`).join('');
    return `<${type}>${listItems}</${type}>`;
  }

  applySyntaxHighlighting(element) {
    if (typeof hljs === 'undefined') {
      console.warn('highlight.js not loaded');
      return;
    }
    
    const codeBlocks = element.querySelectorAll('pre code:not(.hljs)');
    codeBlocks.forEach((block) => {
      const pre = block.parentElement;
      if (!pre || pre.querySelector('.code-header')) return;
      
      // Get language from class
      const languageClass = Array.from(block.classList).find(cls => cls.startsWith('language-'));
      const language = languageClass ? languageClass.replace('language-', '') : 'plaintext';
      
      // Apply syntax highlighting
      if (language !== 'plaintext') {
        try {
          hljs.highlightElement(block);
        } catch (e) {
          console.warn('Highlighting failed:', e);
        }
      }
      
      // Create header with language and copy button
      const header = document.createElement('div');
      header.className = 'code-header';
      header.innerHTML = `
        <span class="code-language">${language}</span>
        <button class="code-copy-btn" aria-label="Copy code">Copy</button>
      `;
      
      const copyBtn = header.querySelector('.code-copy-btn');
      const codeText = block.textContent;
      
      copyBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(codeText);
          copyBtn.textContent = 'Copied!';
          copyBtn.classList.add('copied');
          setTimeout(() => {
            copyBtn.textContent = 'Copy';
            copyBtn.classList.remove('copied');
          }, 2000);
        } catch (err) {
          console.error('Failed to copy code:', err);
        }
      });
      
      pre.insertBefore(header, block);
    });
  }

  initLazySyntaxHighlighting() {
    if (!this.highlightObserver) {
      this.highlightObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const message = entry.target;
            const contentDiv = message.querySelector('.message-content');
            if (contentDiv && !message.dataset.highlighted) {
              this.applySyntaxHighlighting(contentDiv);
              message.dataset.highlighted = 'true';
              this.highlightObserver.unobserve(message);
            }
          }
        });
      }, { rootMargin: '50px' });
    }
  }

  observeMessage(messageElement) {
    if (this.highlightObserver) {
      this.highlightObserver.observe(messageElement);
    }
  }
}