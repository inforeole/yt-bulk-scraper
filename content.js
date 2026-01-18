// content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "SCRAPE_URLS") {
        scrapeYouTube(request.limit).then(data => {
            sendResponse({ status: "DONE", data: data });
        });
        return true; 
    }
});

async function scrapeYouTube(limit) {
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
                // On retire "il y a " et "Diffusé " (et les espaces autour)
                let cleanDateText = dateText
                    .replace(/il y a\s*/i, '')
                    .replace(/Diffusé\s*/i, '')
                    .trim();

                if (!videosMap.has(cleanUrl)) {
                    videosMap.set(cleanUrl, { 
                        url: cleanUrl, 
                        title: title, 
                        // On utilise le texte nettoyé pour l'affichage
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