import { escapeHtml } from '../utils.js';
import { CONFIG } from '../config.js';

export class ChatUI {
    constructor(app) {
        this.app = app;
    }

    createMessageElement(type, content, isThinking = false) {
        const messageDiv = document.createElement("div");
        messageDiv.className = `message ${type}`;

        if (type === 'bot' && !isThinking) {
            messageDiv.dataset.rawContent = content;
        }

        const headerDiv = document.createElement("div");
        headerDiv.className = "message-header";

        if (type === 'user') {
            const nameSpan = document.createElement('span');
            nameSpan.textContent = this.app.userName || 'You';
            nameSpan.className = 'user-name';
            headerDiv.appendChild(nameSpan);
        } else {
            const avatar = document.createElement("img");
            avatar.src = isThinking ? "assets/images/avatar-thinking.png" : "assets/images/avatar.png";
            avatar.alt = isThinking ? "Cindy is thinking" : "Cindy";
            avatar.className = isThinking ? "bot-avatar thinking" : "bot-avatar";

            const nameSpan = document.createElement("span");
            nameSpan.textContent = isThinking ? "Cindy is thinking..." : "Cindy";
            nameSpan.className = "bot-name";

            headerDiv.appendChild(avatar);
            headerDiv.appendChild(nameSpan);
        }

        const contentDiv = document.createElement("div");
        contentDiv.className = "message-content";

        if (type === 'bot' && !isThinking) {
            // Markdown parsing happens in the main controller or via a helper
            // For now, we assume content is ready or will be processed later
            contentDiv.innerHTML = content; 
        } else {
            contentDiv.innerHTML = escapeHtml(content).replace(/\n/g, '<br>');
        }

        messageDiv.appendChild(headerDiv);
        messageDiv.appendChild(contentDiv);

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'message-actions';
        messageDiv.appendChild(actionsDiv);

        return messageDiv;
    }

    createTypingIndicator(question, phrases = []) {
        const messageDiv = document.createElement("div");
        messageDiv.className = "message bot";
        const headerDiv = document.createElement("div");
        headerDiv.className = "message-header";
        const avatar = document.createElement("img");
        avatar.src = "assets/images/avatar-thinking.png";
        avatar.alt = "Cindy is thinking";
        avatar.className = "bot-avatar thinking";
        const nameSpan = document.createElement("span");
        nameSpan.textContent = "Cindy";
        nameSpan.className = "bot-name";
        headerDiv.appendChild(avatar);
        headerDiv.appendChild(nameSpan);
        const contentDiv = document.createElement("div");
        contentDiv.className = "message-content";
        const typingDiv = document.createElement("div");
        typingDiv.className = "typing";
        typingDiv.setAttribute("aria-label", "Cindy is typing");
        const textSpan = document.createElement("span");
        textSpan.className = "thinking-text";
        
        let idx = 0;
        textSpan.textContent = phrases[idx] || '';
        const dot1 = document.createElement("span");
        dot1.className = "dot";
        const dot2 = document.createElement("span");
        dot2.className = "dot";
        const dot3 = document.createElement("span");
        dot3.className = "dot";
        typingDiv.appendChild(textSpan);
        typingDiv.appendChild(dot1);
        typingDiv.appendChild(dot2);
        typingDiv.appendChild(dot3);
        contentDiv.appendChild(typingDiv);
        messageDiv.appendChild(headerDiv);
        messageDiv.appendChild(contentDiv);
        
        let intervalMs = 2500;
        let intervalId = setInterval(() => {
            if (phrases.length > 0) {
                idx = (idx + 1) % phrases.length;
                textSpan.textContent = phrases[idx] || '';
            }
        }, intervalMs);

        messageDiv._stopThinking = () => { clearInterval(intervalId); };
        messageDiv._setThinkingPhrases = (newPhrases, newIntervalMs) => {
            if (Array.isArray(newPhrases) && newPhrases.length > 0) {
                const cleaned = newPhrases.map(p => String(p).replace(/\.\.\.$/, '')).filter(p => p.length > 0);
                const uniq = [];
                const seen = new Set();
                for (const p of cleaned) {
                    const k = p.toLowerCase();
                    if (!seen.has(k)) { seen.add(k); uniq.push(p); }
                }
                phrases = uniq;
                idx = 0;
                textSpan.textContent = phrases[idx] || '';
            }
            if (Number(newIntervalMs) > 0) {
                intervalMs = Number(newIntervalMs);
            }
            clearInterval(intervalId);
            intervalId = setInterval(() => {
                if (phrases.length > 0) {
                    idx = (idx + 1) % phrases.length;
                    textSpan.textContent = phrases[idx] || '';
                }
            }, intervalMs);
        };
        return messageDiv;
    }

    updateStreamingMessage(contentDiv, text, plainMode = false) {
        if (!contentDiv) return;
        let rendered = text;
        if (!plainMode && this.app.markdownParser) {
            // Check for incomplete code blocks and close them temporarily for rendering
            const codeBlockCount = (text.match(/```/g) || []).length;
            let safeText = text;
            if (codeBlockCount % 2 !== 0) {
                safeText += '\n```';
            }
            rendered = this.app.markdownParser.parseMarkdown(safeText);
        } else {
            rendered = escapeHtml(text).replace(/\n/g, '<br>');
        }
        contentDiv.innerHTML = rendered;
        
        // Ensure syntax highlighting is applied to new code blocks
        if (this.app.markdownParser && !plainMode) {
             this.app.markdownParser.applySyntaxHighlighting(contentDiv);
        }
    }

    showErrorWithRetry(message, originalQuestion, retryCallback) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'message bot error';
        errorDiv.innerHTML = `
          <div class="message-header">
            <img src="assets/images/avatar-yellow.png" alt="Cindy" class="bot-avatar">
            <span class="bot-name">Cindy</span>
          </div>
          <div class="message-content">
            <p>${message}</p>
            <button class="retry-btn">Try Again</button>
          </div>
        `;
        const retryBtn = errorDiv.querySelector('.retry-btn');
        retryBtn.addEventListener('click', async () => {
            errorDiv.remove();
            if (retryCallback) retryCallback();
        });
        this.app.elements.chatDiv.appendChild(errorDiv);
        this.app.uiManager.scrollToBottom();
    }

    handleMaintenanceMode() {
        this.app.showToast('🔧 System is under maintenance. Please try again later.', 'warning');
        const maintenanceDiv = document.createElement('div');
        maintenanceDiv.className = 'message bot error';
        maintenanceDiv.innerHTML = `
          <div class="message-header">
            <img src="assets/images/avatar-yellow.png" alt="Cindy" class="bot-avatar">
            <span class="bot-name">System Message</span>
          </div>
          <div class="message-content">
            <p><strong>🔧 System Under Maintenance</strong></p>
            <p>ChatCDO is currently undergoing scheduled maintenance. Please check back shortly.</p>
          </div>
        `;
        this.app.elements.chatDiv.appendChild(maintenanceDiv);
        this.app.elements.chatInput.disabled = true; 
    }

    showTableError(contentDiv, message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'table-error';
        errorDiv.innerHTML = `
          <div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 12px; margin: 10px 0;">
            <strong>⚠️ Table Display Issue</strong>
            <p style="margin: 8px 0 0 0; font-size: 0.9em;">${message}. The raw data is available below.</p>
          </div>
        `;
        contentDiv.insertBefore(errorDiv, contentDiv.firstChild);
    }

    styleSourcesSection(contentDiv) {
        if (!contentDiv) return;
        const hrs = contentDiv.querySelectorAll('hr');
        hrs.forEach(hr => {
            const nextElement = hr.nextElementSibling;
            if (!nextElement) return;
            const textContent = nextElement.textContent.trim().toLowerCase();
            const isSourcesHeader = textContent === 'sources' || 
                                    textContent === 'sources:' || 
                                    textContent.startsWith('sources');
            if (isSourcesHeader) {
                hr.classList.add('sources-divider');
                hr.style.borderTop = '1px solid #e2e8f0';
                hr.style.margin = '28px 0 16px 0';
                hr.style.opacity = '0.6';
                
                nextElement.classList.add('sources-header');
                nextElement.style.color = '#64748b';
                nextElement.style.fontSize = '0.85rem';
                nextElement.style.fontWeight = '600';
                nextElement.style.textTransform = 'uppercase';
                nextElement.style.letterSpacing = '0.5px';
                nextElement.style.marginTop = '0';
                nextElement.style.marginBottom = '12px';
                
                let listElement = nextElement.nextElementSibling;
                if (listElement && listElement.tagName === 'UL') {
                    listElement.classList.add('sources-list');
                    listElement.style.margin = '12px 0 0 0';
                    listElement.style.padding = '0';
                    listElement.style.listStyle = 'none';
                    listElement.style.background = 'transparent';
                    listElement.style.border = 'none';
                    
                    const listItems = listElement.querySelectorAll('li');
                    listItems.forEach(li => {
                        li.style.padding = '6px 0';
                        li.style.color = '#64748b';
                        li.style.fontSize = '0.85rem';
                        li.style.lineHeight = '1.6';
                        li.style.paddingLeft = '20px';
                        li.style.position = 'relative';
                        li.style.listStyle = 'none';
                        const firstChar = li.textContent.trim()[0];
                        const isEmoji = /[\u{1F300}-\u{1F9FF}]/u.test(firstChar);
                        if (!isEmoji) {
                            li.style.paddingLeft = '20px';
                            const bullet = document.createElement('span');
                            bullet.textContent = '•';
                            bullet.style.position = 'absolute';
                            bullet.style.left = '0';
                            bullet.style.color = '#94a3b8';
                            li.insertBefore(bullet, li.firstChild);
                        }
                    });
                }
            }
        });
        
        const lastPara = contentDiv.querySelector('p:last-of-type');
        if (lastPara && lastPara.textContent.trim().toLowerCase().includes('source')) {
            lastPara.style.borderTop = '1px solid #e2e8f0';
            lastPara.style.paddingTop = '16px';
            lastPara.style.marginTop = '24px';
            lastPara.style.color = '#64748b';
            lastPara.style.fontSize = '0.85rem';
        }
    }

    renderSourcesHTML(contentDiv, accessed_documents, accessed_tools, source_categories) {
        if (!contentDiv) return;
        const existing = contentDiv.querySelector('.sources-section');
        if (existing) existing.remove();
        const wrapper = document.createElement('div');
        wrapper.className = 'sources-section';
        const hr = document.createElement('hr');
        const header = document.createElement('p');
        header.textContent = 'Sources';
        const list = document.createElement('ul');
        const items = [];
        if (Array.isArray(accessed_documents)) {
            accessed_documents.forEach(doc => {
                if (!doc) return;
                let name = '';
                let category = '';
                if (typeof doc === 'object') {
                    name = (doc.name || '').trim();
                    category = (doc.category || '').trim();
                } else if (typeof doc === 'string') {
                    name = doc.trim();
                } else if (typeof doc === 'number') {
                    name = `Document ${doc}`;
                }
                if (name && name !== 'null' && name !== 'undefined') {
                    items.push(category ? `${name} (${category})` : name);
                }
            });
        }
        if (Array.isArray(accessed_tools)) {
            accessed_tools.forEach(tool => {
                if (!tool) return;
                let name = '';
                if (typeof tool === 'object') {
                    name = (tool.name || '').trim();
                } else if (typeof tool === 'string') {
                    name = tool.trim();
                } else if (typeof tool === 'number') {
                    name = `Live Data Tool ${tool}`;
                }
                if (name && name !== 'null' && name !== 'undefined') {
                    items.push(name);
                }
            });
        }
        const seen = new Set();
        items.forEach(text => {
            const key = text.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            const li = document.createElement('li');
            li.textContent = text;
            list.appendChild(li);
        });

        if (items.length > 0) {
            wrapper.appendChild(hr);
            wrapper.appendChild(header);
            wrapper.appendChild(list);
            contentDiv.appendChild(wrapper);
        }
    }

    cleanAIResponse(answer) {
        if (!answer) return answer;
        // Remove internal missing knowledge tags and fragments (e.g., <MISS)
        const missingKnowledgeRegex = /<MISSING_KNOWLEDGE>|<MISS[ING_KNOWLEDGE]*$/gi;
        let cleaned = answer.replace(missingKnowledgeRegex, '').trim();
        
        cleaned = cleaned
          .replace(/,\s*}/g, '}')  
          .replace(/,\s*]/g, ']')  
          .replace(/,\s*$/gm, ''); 
        cleaned = cleaned.replace(/},\s*}/g, '}]');
        cleaned = cleaned.replace(/("\s*:\s*"[^"]*")(\s*"\s*:)/g, '$1,$2');
        cleaned = cleaned.replace(/("\s*:\s*"[^"]*")(\s*\n\s*"\s*:)/g, '$1,$2');
        return cleaned;
    }

    buildAnswerWithSources(answer, accessed_documents, accessed_tools, source_categories, missingKnowledge = false) {
        if (missingKnowledge) return answer;
        if (answer.includes('---\n\n**Sources**')) return answer;
        let sourcesSection = '\n\n---\n\n**Sources**\n\n';
        const sources = [];

        if (accessed_documents && accessed_documents.length > 0) {
          accessed_documents.forEach(doc => {
            if (doc) {
              let docName = '';
              let docCategory = '';
              if (typeof doc === 'object' && doc.name) {
                docName = doc.name;
                docCategory = doc.category || '';
              } else if (typeof doc === 'string') {
                docName = doc.trim();
              } else if (typeof doc === 'number') {
                docName = `Document ${doc}`;
              }
              if (docName && docName !== 'null' && docName !== 'undefined') {
                if (docCategory) {
                  sources.push(`📄 ${docName} (${docCategory})`);
                } else {
                  sources.push(`📄 ${docName}`);
                }
              }
            }
          });
        }

        if (accessed_tools && accessed_tools.length > 0) {
          accessed_tools.forEach(tool => {
            if (tool) {
              let toolName = '';
              if (typeof tool === 'object' && tool.name) {
                toolName = tool.name;
              } else if (typeof tool === 'string') {
                toolName = tool.trim();
              } else if (typeof tool === 'number') {
                toolName = `Live Data Tool ${tool}`;
              }
              if (toolName && toolName !== 'null' && toolName !== 'undefined') {
                sources.push(`🔧 ${toolName}`);
              }
            }
          });
        }

        const uniqueSources = [...new Set(sources)];
        if (uniqueSources.length === 0) {
          sourcesSection += '• Knowledge Base\n';
        } else {
          uniqueSources.forEach(source => {
            sourcesSection += `• ${source}\n`;
          });
        }
        return answer + sourcesSection;
    }

    async resolveDocumentMetadata(doc) {
        // Returns { name, category } or null
        try {
          if (!doc) return null;
          if (typeof doc === 'object') {
            return { name: (doc.name || '').trim(), category: (doc.category || '').trim() };
          }
          let id = null;
          if (typeof doc === 'number') id = doc;
          if (typeof doc === 'string') {
            const m = doc.match(/Document\s*(\d+)/i);
            if (m) id = Number(m[1]);
            else if (/^\d+$/.test(doc.trim())) id = Number(doc.trim());
          }
          if (id !== null && this.app && this.app.apiManager && this.app.apiManager.getDocument) {
            const resp = await this.app.apiManager.getDocument(id);
            const doc = resp && (resp.document || resp.document || resp);
            if (doc && (doc.title || doc.name || doc.id)) {
              return { name: (doc.title || doc.name || `Document ${doc.id || id}`).trim(), category: (doc.category_name || doc.subcategory_name || doc.category || '').trim() };
            }
          }
        } catch (e) {
          console.warn('resolveDocumentMetadata error', e);
        }
        return null;
    }

    async fetchDocumentsByIds(ids = []) {
        if (!Array.isArray(ids) || ids.length === 0) return [];
        const results = [];
        try {
          const promises = ids.map(id => {
            try {
              return this.app.apiManager.getDocument(id).catch(e => ({ error: e }));
            } catch (e) {
              return Promise.resolve({ error: e });
            }
          });
          const responses = await Promise.all(promises);
          for (const resp of responses) {
            if (!resp) continue;
            const doc = resp.document || resp;
            if (doc && (doc.title || doc.name || doc.id)) {
              results.push({ name: doc.title || doc.name || `Document ${doc.id || ''}`, category: doc.category_name || doc.subcategory_name || '' });
            }
          }
        } catch (e) {
          console.warn('fetchDocumentsByIds error', e);
        }
        return results;
    }

    async renderSourcesHTMLAsync(contentDiv, accessed_documents, accessed_tools, source_categories) {
        // Render immediate items first (may include placeholders), then try to resolve IDs
        this.renderSourcesHTML(contentDiv, accessed_documents, accessed_tools, source_categories);
        if (!Array.isArray(accessed_documents) || accessed_documents.length === 0) return;
        const unresolved = [];
        accessed_documents.forEach(doc => {
          if (!doc) return;
          if (typeof doc === 'object' && (doc.name || doc.title)) return; // already resolved
          if (typeof doc === 'string' && !/^Document\s*\d+/i.test(doc) && !/^\d+$/.test(doc.trim())) return;
          unresolved.push(doc);
        });
        if (unresolved.length === 0) return;

        // Fetch metadata in parallel
        const promises = unresolved.map(d => this.resolveDocumentMetadata(d));
        const results = await Promise.all(promises);
        const resolved = [];
        results.forEach(r => { if (r && r.name) resolved.push(r); });
        if (resolved.length === 0) return;

        // Merge resolved names back into accessed_documents and update dataset if possible
        const finalDocs = accessed_documents.map(doc => {
          try {
            if (typeof doc === 'object' && (doc.name || doc.title)) return doc;
            const m = (typeof doc === 'string' && doc.match(/Document\s*(\d+)/i)) ? Number(doc.match(/Document\s*(\d+)/i)[1]) : (typeof doc === 'string' && /^\d+$/.test(doc.trim()) ? Number(doc.trim()) : null);
            if (m !== null) {
              const found = results.find((res, idx) => {
                const orig = unresolved[idx];
                if (typeof orig === 'number') return orig === m;
                if (typeof orig === 'string' && orig.match(/Document\s*(\d+)/i)) return Number(orig.match(/Document\s*(\d+)/i)[1]) === m;
                return false;
              });
              if (found && found.name) return { name: found.name, category: found.category || '' };
            }
          } catch (e) {}
          return doc;
        });

        try {
          // Update dataset on parent message if present
          const parentMsg = contentDiv && contentDiv.closest && contentDiv.closest('.message');
          if (parentMsg && parentMsg.dataset) {
            parentMsg.dataset.accessedDocuments = JSON.stringify(finalDocs || []);
          }
        } catch (e) {}

        // Re-render sources block with resolved names
        try {
          const existing = contentDiv.querySelector('.sources-section');
          if (existing) existing.remove();
          const docsForRender = finalDocs.map(d => (typeof d === 'object' ? d : (typeof d === 'string' ? d : '')));
          this.renderSourcesHTML(contentDiv, docsForRender, accessed_tools, source_categories);
        } catch (e) {
          console.warn('Failed to re-render resolved sources', e);
        }
    }
    
    renderCurrentChat() {
        const { chatDiv } = this.app.elements;
        const fragment = document.createDocumentFragment();
        this.app.currentConversation.forEach(msg => {
            const userMsg = this.createMessageElement("user", msg.question);
            let fullAnswer = msg.answer;
            if (!fullAnswer.includes('---\n\n**Sources**')) {
                fullAnswer = this.buildAnswerWithSources(
                    msg.answer,
                    msg.accessed_documents || [],
                    msg.accessed_tools || [],
                    msg.source_categories || {}
                );
            }
            
            fullAnswer = this.cleanAIResponse(fullAnswer);
            let renderedAnswer = fullAnswer;
            if (this.app.markdownParser) {
                renderedAnswer = this.app.markdownParser.parseMarkdown(fullAnswer);
            }
            
            const botMsg = this.createMessageElement("bot", renderedAnswer);
            botMsg.dataset.rawContent = fullAnswer;
            botMsg.dataset.accessedDocuments = JSON.stringify(msg.accessed_documents || []);
            botMsg.dataset.accessedTools = JSON.stringify(msg.accessed_tools || []);
            botMsg.dataset.sourceCategories = JSON.stringify(msg.source_categories || {});
            fragment.appendChild(userMsg);
            fragment.appendChild(botMsg);
        });
        chatDiv.innerHTML = "";
        chatDiv.appendChild(fragment);
        setTimeout(() => {
            const allMessages = chatDiv.querySelectorAll('.message');
            allMessages.forEach(message => {
                if (!message.querySelector('.typing')) {
                    this.app.messageManager.ensureActionButtons(message);
                }
            });
            const botMessages = chatDiv.querySelectorAll('.message.bot');
            botMessages.forEach(msg => {
                const contentDiv = msg.querySelector('.message-content');
                if (contentDiv) {
                    if (this.app.markdownParser) {
                        this.app.markdownParser.applySyntaxHighlighting(contentDiv);
                        this.app.markdownParser.renderCharts(contentDiv);
                    }
                    this.styleSourcesSection(contentDiv);
                }
            });
        }, 0);
        this.app.uiManager.scrollToBottom();
    }

    prependMessages(messages) {
        const { chatDiv } = this.app.elements;
        if (!messages || messages.length === 0) return;
        
        const fragment = document.createDocumentFragment();
        const currentScrollHeight = chatDiv.scrollHeight;
        
        messages.forEach(msg => {
            const userMsg = this.createMessageElement("user", msg.question);
            let fullAnswer = msg.answer;
            if (!fullAnswer.includes('---\n\n**Sources**')) {
                fullAnswer = this.buildAnswerWithSources(
                    msg.answer,
                    msg.accessed_documents || [],
                    msg.accessed_tools || [],
                    msg.source_categories || {}
                );
            }
            
            fullAnswer = this.cleanAIResponse(fullAnswer);
            let renderedAnswer = fullAnswer;
            if (this.app.markdownParser) {
                renderedAnswer = this.app.markdownParser.parseMarkdown(fullAnswer);
            }

            const botMsg = this.createMessageElement("bot", renderedAnswer);
            botMsg.dataset.rawContent = fullAnswer;
            botMsg.dataset.accessedDocuments = JSON.stringify(msg.accessed_documents || []);
            botMsg.dataset.accessedTools = JSON.stringify(msg.accessed_tools || []);
            botMsg.dataset.sourceCategories = JSON.stringify(msg.source_categories || {});
            
            fragment.appendChild(userMsg);
            fragment.appendChild(botMsg);
        });
        
        // Insert before first child
        if (chatDiv.firstChild) {
            chatDiv.insertBefore(fragment, chatDiv.firstChild);
        } else {
            chatDiv.appendChild(fragment);
        }
        
        setTimeout(() => {
            // Restore scroll position
            const newScrollHeight = chatDiv.scrollHeight;
            chatDiv.scrollTop = newScrollHeight - currentScrollHeight;
            
            const allMessages = chatDiv.querySelectorAll('.message');
            const addedCount = messages.length * 2;
            
            for (let i = 0; i < addedCount; i++) {
                const message = allMessages[i];
                if (!message) continue;
                
                if (!message.querySelector('.typing')) {
                    this.app.messageManager.ensureActionButtons(message);
                }
                
                if (message.classList.contains('bot')) {
                    const contentDiv = message.querySelector('.message-content');
                    if (contentDiv) {
                        if (this.app.markdownParser) {
                            this.app.markdownParser.applySyntaxHighlighting(contentDiv);
                            this.app.markdownParser.renderCharts(contentDiv);
                        }
                        this.styleSourcesSection(contentDiv);
                    }
                }
            }
        }, 0);
    }

    streamContent(text, contentDiv, messageElement, plainMode = false) {
        return new Promise((resolve) => {
            const tokens = (text.match(/[\s]+|[^\s]+/g) || []);
            const totalLen = text.length;
            const baseDelay = 36;
            const wordsPerChunk = totalLen > 1500 ? 5 : totalLen > 800 ? 4 : 3;
            let idx = 0;
            let buffer = "";
            
            const takeChunk = () => {
                if (idx >= tokens.length) { resolve(); return; }
                let chunk = "";
                let words = 0;
                while (idx < tokens.length && words < wordsPerChunk) {
                    const t = tokens[idx++];
                    chunk += t;
                    if (!/\s+/.test(t)) words++;
                    if (/[.!?]$/.test(t) || /\n$/.test(t)) break;
                }
                buffer += chunk;
                const isFinal = idx >= tokens.length;
                const evt = new CustomEvent('streamingUpdate', { detail: { fullAnswer: buffer, chunk, isFinal, contentDiv, messageElement, plain: !!plainMode } });
                document.dispatchEvent(evt);
                
                let delay = baseDelay;
                if (/[.!?]\s*$/.test(chunk)) delay += 160;
                else if (/[,;:]\s*$/.test(chunk)) delay += 100;
                else if (/\n\s*$/.test(chunk)) delay += 140;
                
                setTimeout(() => {
                    requestAnimationFrame(takeChunk);
                }, delay);
            };
            
            requestAnimationFrame(takeChunk);
        });
    }

    enableInlineRename(index, currentTitle, listItem, titleSpan, ellipsis, callbacks) {
        if (listItem.querySelector('.rename-input')) return;
        const input = document.createElement("input");
        input.type = "text";
        input.className = "rename-input";
        input.value = currentTitle;
        input.maxLength = CONFIG.MAX_TITLE_LENGTH;
        listItem.replaceChild(input, titleSpan);
        ellipsis.style.display = "none";
        input.focus();
        input.select();
        
        let renameCompleted = false;
        const completeRename = async () => {
            if (renameCompleted) return;
            renameCompleted = true;
            const newName = input.value.trim();
            if (newName && newName !== currentTitle) {
                if (callbacks.onRename) await callbacks.onRename(newName);
            } 
            listItem.replaceChild(titleSpan, input);
            ellipsis.style.display = "";
            if (callbacks.onComplete) callbacks.onComplete();
        };
        
        const cancelRename = () => {
            if (renameCompleted) return;
            renameCompleted = true;
            listItem.replaceChild(titleSpan, input);
            ellipsis.style.display = "";
        };
        
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                completeRename();
            } else if (e.key === "Escape") {
                e.preventDefault();
                cancelRename();
            } else if (e.key === " ") {
                e.stopPropagation();
            }
        });
        input.addEventListener("blur", (e) => {
            setTimeout(() => { 
                if (!renameCompleted) cancelRename(); 
            }, 150);
        });
        input.addEventListener("click", (e) => e.stopPropagation());
        input.addEventListener("mousedown", (e) => e.stopPropagation());
        input.addEventListener("input", (e) => e.stopPropagation());
    }
}

