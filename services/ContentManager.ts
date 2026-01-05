import { CONTENT_DATABASE, ContentTopic } from '../data/contentDatabase';

// Key for LocalStorage to track used history
const HISTORY_KEY = 'viral_tube_history_v1';

export const ContentManager = {
    getUnusedTopic: (): ContentTopic | null => {
        // 1. Get history
        const historyJson = localStorage.getItem(HISTORY_KEY);
        const usedIds: string[] = historyJson ? JSON.parse(historyJson) : [];

        // 2. Filter available topics
        const available = CONTENT_DATABASE.filter(t => !usedIds.includes(t.id));

        // 3. If all used, reset history (infinite loop strategy) or return random
        if (available.length === 0) {
            console.warn("All topics covered! Resetting history loop.");
            localStorage.setItem(HISTORY_KEY, JSON.stringify([]));
            return CONTENT_DATABASE[Math.floor(Math.random() * CONTENT_DATABASE.length)];
        }

        // 4. Pick random
        const selected = available[Math.floor(Math.random() * available.length)];

        // 5. Mark as used
        usedIds.push(selected.id);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(usedIds));

        return selected;
    },

    resetHistory: () => {
        localStorage.removeItem(HISTORY_KEY);
    }
};
