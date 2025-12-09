const STORAGE_KEY_PREFIX = "axela-ai-metadata-";

const canUseStorage = () => typeof window !== "undefined" && !!window.localStorage;

export const saveAiMetadata = (messageId, data) => {
  if (!messageId || !data || !canUseStorage()) return;
  try {
    window.localStorage.setItem(
      `${STORAGE_KEY_PREFIX}${messageId}`,
      JSON.stringify(data)
    );
  } catch (error) {
    console.warn("Failed to cache AI metadata:", error);
  }
};

export const loadAiMetadata = (messageId) => {
  if (!messageId || !canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${messageId}`);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn("Failed to load cached AI metadata:", error);
    return null;
  }
};

export const clearAiMetadata = (messageId) => {
  if (!messageId || !canUseStorage()) return;
  try {
    window.localStorage.removeItem(`${STORAGE_KEY_PREFIX}${messageId}`);
  } catch (error) {
    console.warn("Failed to clear cached AI metadata:", error);
  }
};
