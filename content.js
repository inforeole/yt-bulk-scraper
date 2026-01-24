// content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "SCRAPE_URLS") {
        scrapeYouTube(request.limit).then(data => {
            sendResponse({ status: "DONE", data: data });
        });
        return true;
    }
});

function detectPageType() {
    const url = window.location.href;
    if (url.includes('/results')) return 'search';
    if (url.includes('/playlist')) return 'playlist';
    if (url.includes('/@')) return 'channel';
    return 'unknown';
}

async function scrapeYouTube(limit) {
    const pageType = detectPageType();

    if (pageType === 'playlist') {
        return await scrapePlaylist(limit);
    } else if (pageType === 'channel') {
        return await scrapeChannel(limit);
    } else {
        return await scrapeSearch(limit);
    }
}

async function scrapePlaylist(limit) {
    let videosMap = new Map();
    let noChangeCount = 0;

    const extract = () => {
        const renderers = document.querySelectorAll('ytd-playlist-video-renderer');

        renderers.forEach((renderer, index) => {
            const linkTag = renderer.querySelector('a#video-title');
            if (!linkTag) return;

            const href = linkTag.href;
            if (href && href.includes('/watch?v=')) {
                // Nettoyer l'URL (garder seulement la partie video)
                const urlObj = new URL(href);
                const videoId = urlObj.searchParams.get('v');
                const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;

                const title = (linkTag.getAttribute('title') || linkTag.innerText).trim();

                // Index dans la playlist (position)
                const indexSpan = renderer.querySelector('#index');
                const position = indexSpan ? indexSpan.innerText.trim() : String(index + 1);

                if (!videosMap.has(cleanUrl)) {
                    videosMap.set(cleanUrl, {
                        url: cleanUrl,
                        title: title,
                        dateText: `#${position}`,
                        timestamp: Date.now() - index // Pour garder l'ordre de la playlist
                    });
                }
            }
        });
    };

    extract();

    while (videosMap.size < limit) {
        const previousSize = videosMap.size;
        window.scrollTo(0, document.documentElement.scrollHeight);
        await new Promise(r => setTimeout(r, 1500));

        extract();

        if (videosMap.size === previousSize) {
            noChangeCount++;
            if (noChangeCount > 2) break;
        } else {
            noChangeCount = 0;
        }
    }

    // Pour les playlists, on garde l'ordre original (par position)
    const sortedResults = Array.from(videosMap.values())
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);

    return sortedResults;
}

async function scrapeChannel(limit) {
    let videosMap = new Map();
    let noChangeCount = 0;

    const extract = () => {
        // Les pages de chaîne utilisent ytd-rich-item-renderer pour la grille
        const renderers = document.querySelectorAll('ytd-rich-item-renderer');

        renderers.forEach((renderer, index) => {
            // Le lien vidéo peut être dans différents endroits selon le layout
            const linkTag = renderer.querySelector('a#video-title-link') ||
                           renderer.querySelector('a#video-title') ||
                           renderer.querySelector('a[href*="/watch?v="]');
            if (!linkTag) return;

            const href = linkTag.href;
            if (href && href.includes('/watch?v=')) {
                const urlObj = new URL(href);
                const videoId = urlObj.searchParams.get('v');
                const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;

                // Titre: essayer plusieurs sélecteurs
                const titleEl = renderer.querySelector('#video-title') ||
                               renderer.querySelector('yt-formatted-string#video-title');
                const title = titleEl ? (titleEl.getAttribute('title') || titleEl.innerText).trim() : '';

                // Date de publication
                let dateText = "";
                const metadataLine = renderer.querySelector('#metadata-line');
                if (metadataLine) {
                    const spans = metadataLine.querySelectorAll('span');
                    // Généralement: "X vues • il y a Y jours" ou spans séparés
                    spans.forEach(span => {
                        const text = span.innerText;
                        if (text.includes('il y a') || text.includes('ago') ||
                            text.includes('jour') || text.includes('day') ||
                            text.includes('semaine') || text.includes('week') ||
                            text.includes('mois') || text.includes('month') ||
                            text.includes('an') || text.includes('year') ||
                            text.includes('heure') || text.includes('hour')) {
                            dateText = text;
                        }
                    });
                }

                let cleanDateText = dateText
                    .replace(/il y a\s*/i, '')
                    .replace(/Diffusé\s*/i, '')
                    .replace(/Streamed\s*/i, '')
                    .trim();

                if (!videosMap.has(cleanUrl)) {
                    videosMap.set(cleanUrl, {
                        url: cleanUrl,
                        title: title,
                        dateText: cleanDateText,
                        timestamp: convertRelativeDateToTimestamp(dateText)
                    });
                }
            }
        });
    };

    extract();

    while (videosMap.size < limit) {
        const previousSize = videosMap.size;
        window.scrollTo(0, document.documentElement.scrollHeight);
        await new Promise(r => setTimeout(r, 1500));

        extract();

        if (videosMap.size === previousSize) {
            noChangeCount++;
            if (noChangeCount > 2) break;
        } else {
            noChangeCount = 0;
        }
    }

    const sortedResults = Array.from(videosMap.values())
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);

    return sortedResults;
}

async function scrapeSearch(limit) {
    let videosMap = new Map();
    let noChangeCount = 0;

    const extract = () => {
        const renderers = document.querySelectorAll('ytd-video-renderer');

        renderers.forEach(renderer => {
            const linkTag = renderer.querySelector('a#video-title');
            if (!linkTag) return;

            const href = linkTag.href;
            if (href && href.includes('/watch?v=')) {
                const cleanUrl = href.split('&')[0];
                const title = (linkTag.getAttribute('title') || linkTag.innerText).trim();

                // Extraction de la date
                let dateText = "";
                const metaSpans = renderer.querySelectorAll('#metadata-line > span');
                if (metaSpans.length >= 2) {
                    dateText = metaSpans[1].innerText;
                } else if (metaSpans.length === 1) {
                    dateText = metaSpans[0].innerText;
                }

                // NETTOYAGE DE LA DATE
                let cleanDateText = dateText
                    .replace(/il y a\s*/i, '')
                    .replace(/Diffusé\s*/i, '')
                    .trim();

                if (!videosMap.has(cleanUrl)) {
                    videosMap.set(cleanUrl, {
                        url: cleanUrl,
                        title: title,
                        dateText: cleanDateText,
                        timestamp: convertRelativeDateToTimestamp(dateText)
                    });
                }
            }
        });
    };

    extract();

    while (videosMap.size < limit) {
        const previousHeight = document.documentElement.scrollHeight;
        window.scrollTo(0, document.documentElement.scrollHeight);
        await new Promise(r => setTimeout(r, 1500));

        extract();

        const newHeight = document.documentElement.scrollHeight;
        if (newHeight === previousHeight) {
            noChangeCount++;
            if (noChangeCount > 2) break;
        } else {
            noChangeCount = 0;
        }
    }

    const sortedResults = Array.from(videosMap.values())
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);

    return sortedResults;
}

function convertRelativeDateToTimestamp(dateString) {
    if (!dateString) return 0;
    const now = Date.now();
    const s = dateString.toLowerCase();
    const match = s.match(/(\d+)/);
    const value = match ? parseInt(match[0], 10) : 1;
    const minute = 60 * 1000;
    const hour = minute * 60;
    const day = hour * 24;
    const week = day * 7;
    const month = day * 30;
    const year = day * 365;

    if (s.includes('second') || s.includes('seconde')) return now - (value * 1000);
    if (s.includes('minut')) return now - (value * minute);
    if (s.includes('hour') || s.includes('heure')) return now - (value * hour);
    if (s.includes('day') || s.includes('jour')) return now - (value * day);
    if (s.includes('week') || s.includes('semaine')) return now - (value * week);
    if (s.includes('month') || s.includes('mois')) return now - (value * month);
    if (s.includes('year') || s.includes('an')) return now - (value * year);

    return 0;
}
