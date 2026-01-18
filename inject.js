// inject.js - Script injecté dans le contexte de la page YouTube
// Écoute les demandes de fetch depuis le content script

document.addEventListener('yt-fetch-captions', async (e) => {
    const { url, responseEventId } = e.detail;

    try {
        const response = await fetch(url);
        const text = await response.text();

        document.dispatchEvent(new CustomEvent(responseEventId, {
            detail: { success: true, data: text }
        }));
    } catch (err) {
        document.dispatchEvent(new CustomEvent(responseEventId, {
            detail: { success: false, error: err.message }
        }));
    }
});

// Signal que le script est chargé
document.dispatchEvent(new CustomEvent('yt-inject-ready'));
