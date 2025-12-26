export class ContextManager {
    // In-memory store for session contexts
    // Structure: Map<sessionId, { active: Object, archives: Array }>
    static sessions = new Map();

    static getSession(sessionId) {
        if (!sessionId) return { active: null, archives: [] };
        if (!this.sessions.has(sessionId)) {
            this.sessions.set(sessionId, { active: null, archives: [] });
        }
        return this.sessions.get(sessionId);
    }

    /**
     * Updates the active context.
     * If forceArchive is true, the current active context is moved to archives first.
     */
    static updateActiveContext(sessionId, contextData, forceArchive = false) {
        const session = this.getSession(sessionId);
        
        if (forceArchive && session.active) {
            this.archiveActiveContext(sessionId);
        }

        session.active = {
            ...contextData,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Moves the active context to the archives.
     */
    static archiveActiveContext(sessionId) {
        const session = this.getSession(sessionId);
        if (session.active) {
            // Avoid duplicate archives (if identical to top archive)
            const lastArchive = session.archives[0];
            if (!lastArchive || JSON.stringify(lastArchive.summary) !== JSON.stringify(session.active.summary)) {
                session.archives.unshift({ ...session.active });
                // Limit to 5 archives
                if (session.archives.length > 5) session.archives.pop();
            }
        }
    }

    /**
     * Restores an archived context to be the active one.
     * @param {number} index - 1-based index from the list
     */
    static restoreContext(sessionId, index) {
        const session = this.getSession(sessionId);
        const arrayIndex = index - 1; // Convert 1-based to 0-based

        if (session.archives[arrayIndex]) {
            // Archive the current active one before switching
            if (session.active) {
                this.archiveActiveContext(sessionId);
            }

            const restored = session.archives[arrayIndex];
            session.active = restored;
            
            // Remove from archives (it's now active)
            session.archives.splice(arrayIndex, 1);
            return restored;
        }
        return null;
    }

    /**
     * Formats the context for LLM injection
     */
    static getFormattedContext(sessionId) {
        const session = this.getSession(sessionId);
        let text = "";

        if (session.active) {
            text += `[ACTIVE CONTEXT]\n`;
            text += `Topic: ${session.active.summary}\n`;
            text += `Dataset: ${session.active.dataset}\n`;
            if (session.active.filters) text += `Filters: ${session.active.filters}\n`;
        } else {
            text += `[ACTIVE CONTEXT]\n(None - New Conversation)\n`;
        }

        if (session.archives.length > 0) {
            text += `\n[ARCHIVED CONTEXTS]\n`;
            session.archives.forEach((ctx, i) => {
                text += `${i + 1}. ${ctx.summary} (Dataset: ${ctx.dataset})\n`;
            });
            text += `(To restore, output action: "RESTORE" and restore_index: <number>)\n`;
        }

        return text;
    }
}
