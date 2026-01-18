// content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "SCRAPE_URLS") {
        scrapeYouTube(request.limit).then(data => {
            sendResponse({ status: "DONE", data: data });
        });
        return true;
    }

    if (request.action === "GET_TRANSCRIPT") {
        getTranscript().then(data => {
            sendResponse(data);
        }).catch(err => {
            sendResponse({ success: false, error: err.message });
        });
        return true;
    }
});

async function getTranscript() {
    let playerResponse = null;

    // Chercher ytInitialPlayerResponse dans les scripts de la page
    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
        const text = script.textContent;
        if (text && text.includes('ytInitialPlayerResponse')) {
            const startIndex = text.indexOf('ytInitialPlayerResponse');
            if (startIndex === -1) continue;

            let jsonStart = text.indexOf('{', startIndex);
            if (jsonStart === -1) continue;

            // Compter les accolades pour trouver la fin du JSON
            let depth = 0;
            let jsonEnd = jsonStart;
            for (let i = jsonStart; i < text.length; i++) {
                if (text[i] === '{') depth++;
                if (text[i] === '}') depth--;
                if (depth === 0) {
                    jsonEnd = i + 1;
                    break;
                }
            }

            try {
                playerResponse = JSON.parse(text.substring(jsonStart, jsonEnd));
                console.log('playerResponse trouvé');
                break;
            } catch (e) {
                console.log('Erreur parsing:', e.message);
                continue;
            }
        }
    }

    if (!playerResponse) {
        throw new Error("Impossible de trouver les données de la vidéo. Rechargez la page.");
    }

    // Extraire l'URL des sous-titres
    const captions = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

    if (!captions || captions.length === 0) {
        throw new Error("Aucun sous-titre disponible pour cette vidéo");
    }

    // Préférer les sous-titres français, sinon prendre le premier disponible
    let captionTrack = captions.find(c => c.languageCode === 'fr') || captions[0];
    let captionUrl = captionTrack.baseUrl;

    console.log('=== DEBUG TRANSCRIPT ===');
    console.log('Captions disponibles:', captions.map(c => `${c.languageCode} (${c.kind || 'manual'})`));
    console.log('Caption choisie:', captionTrack.languageCode);
    console.log('Caption URL:', captionUrl);

    let transcript = null;

    // Injecter le script externe (une seule fois)
    if (!document.querySelector('#yt-scraper-inject')) {
        const script = document.createElement('script');
        script.id = 'yt-scraper-inject';
        script.src = chrome.runtime.getURL('inject.js');
        document.head.appendChild(script);
        await new Promise(r => setTimeout(r, 100)); // Attendre le chargement
    }

    // Fetch via le script injecté dans le contexte de la page
    const fetchFromPageContext = (url) => {
        return new Promise((resolve) => {
            const responseEventId = 'caption-response-' + Date.now();

            const handler = (e) => {
                document.removeEventListener(responseEventId, handler);
                resolve(e.detail);
            };
            document.addEventListener(responseEventId, handler);

            // Demander le fetch
            document.dispatchEvent(new CustomEvent('yt-fetch-captions', {
                detail: { url, responseEventId }
            }));

            // Timeout
            setTimeout(() => resolve({ success: false, error: 'Timeout' }), 5000);
        });
    };

    try {
        console.log('Fetch depuis contexte page...');
        const result = await fetchFromPageContext(captionUrl);
        console.log('Result:', result);

        if (!result.success || !result.data || result.data.length === 0) {
            throw new Error(result.error || "Réponse vide");
        }

        const text = result.data;
        console.log('Response length:', text.length);
        console.log('Response preview:', text.substring(0, 300));

        // Détecter le format et parser
        if (text.trim().startsWith('{')) {
            const data = JSON.parse(text);
            if (data.events) {
                transcript = data.events
                    .filter(event => event.segs)
                    .map(event => ({
                        timestamp: formatTimestamp(event.tStartMs || 0),
                        text: event.segs.map(seg => seg.utf8).join('').trim()
                    }))
                    .filter(item => item.text);
            }
        } else if (text.includes('<text') || text.includes('<?xml')) {
            return parseXmlCaptions(text, captionTrack, playerResponse);
        } else {
            throw new Error("Format non reconnu");
        }

    } catch (e) {
        console.error('Erreur fetch:', e);

        // Fallback: scraper le panel
        console.log('Fallback: scraping panel...');
        const scraped = await scrapeTranscriptPanel();
        if (scraped && scraped.length > 0) {
            transcript = scraped;
        } else {
            throw new Error(`Échec: ${e.message}`);
        }
    }

    if (!transcript || transcript.length === 0) {
        throw new Error("Aucun segment de sous-titres trouvé");
    }

    // Récupérer le titre de la vidéo
    const title = playerResponse?.videoDetails?.title || document.title.replace(' - YouTube', '');

    return {
        success: true,
        title: title,
        language: captionTrack.languageCode,
        languageName: captionTrack.name?.simpleText || captionTrack.languageCode,
        transcript: transcript
    };
}

async function scrapeTranscriptPanel() {
    console.log('=== SCRAPE PANEL ===');

    // Chercher le bouton "..." sous la vidéo
    const buttons = document.querySelectorAll('#top-level-buttons-computed button, #menu button, ytd-menu-renderer button');
    console.log('Boutons trouvés:', buttons.length);

    let menuOpened = false;
    for (const btn of buttons) {
        const label = btn.getAttribute('aria-label') || '';
        if (label.includes('action') || label.includes('Action') || label.includes('Plus') || label.includes('More')) {
            console.log('Click sur:', label);
            btn.click();
            menuOpened = true;
            await new Promise(r => setTimeout(r, 800));
            break;
        }
    }

    if (menuOpened) {
        // Chercher l'option transcript dans le menu
        const menuItems = document.querySelectorAll('ytd-menu-service-item-renderer, tp-yt-paper-item');
        console.log('Items menu:', menuItems.length);

        for (const item of menuItems) {
            const text = (item.textContent || '').toLowerCase();
            console.log('Menu item:', text.substring(0, 50));
            if (text.includes('transcription') || text.includes('transcript')) {
                console.log('Click sur transcript');
                item.click();
                await new Promise(r => setTimeout(r, 1500));
                break;
            }
        }
    }

    // Chercher les segments avec plusieurs sélecteurs possibles
    let segments = document.querySelectorAll('ytd-transcript-segment-renderer');
    if (segments.length === 0) {
        segments = document.querySelectorAll('[class*="transcript"] [class*="segment"]');
    }
    if (segments.length === 0) {
        segments = document.querySelectorAll('ytd-transcript-body-renderer .segment');
    }

    console.log('Segments trouvés:', segments.length);

    if (segments.length === 0) {
        // Debug: afficher la structure
        const panel = document.querySelector('ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]');
        console.log('Panel transcript présent:', !!panel);
        if (panel) {
            console.log('Panel HTML preview:', panel.innerHTML.substring(0, 500));

            // Chercher tous les éléments avec du texte dans le panel
            const allElements = panel.querySelectorAll('*');
            console.log('Éléments dans le panel:', allElements.length);

            // Chercher les segments avec d'autres sélecteurs
            const possibleSegments = panel.querySelectorAll('yt-formatted-string, span, div[class*="cue"], div[class*="caption"]');
            console.log('Segments possibles:', possibleSegments.length);

            for (let i = 0; i < Math.min(5, possibleSegments.length); i++) {
                console.log(`Element ${i}:`, possibleSegments[i].className, '-', possibleSegments[i].textContent.substring(0, 50));
            }
        }
        return null;
    }

    const transcript = [];
    segments.forEach(seg => {
        // Essayer plusieurs sélecteurs pour timestamp et texte
        const timestampEl = seg.querySelector('.segment-timestamp, [class*="timestamp"], .ytd-transcript-segment-renderer:first-child');
        const textEl = seg.querySelector('.segment-text, [class*="text"]:not([class*="timestamp"]), .ytd-transcript-segment-renderer:last-child');

        const timestamp = timestampEl?.textContent?.trim() || '';
        const text = textEl?.textContent?.trim() || seg.textContent?.trim() || '';

        if (text) {
            transcript.push({ timestamp, text });
        }
    });

    console.log('Scraped', transcript.length, 'segments');
    return transcript.length > 0 ? transcript : null;
}

function formatTimestamp(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function parseXmlCaptions(xmlText, captionTrack, playerResponse) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');
    const textNodes = doc.querySelectorAll('text');

    const transcript = Array.from(textNodes).map(node => {
        const startSeconds = parseFloat(node.getAttribute('start') || '0');
        const text = node.textContent
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&#39;/g, "'")
            .replace(/&quot;/g, '"')
            .trim();

        return {
            timestamp: formatTimestamp(startSeconds * 1000),
            text: text
        };
    }).filter(item => item.text);

    const title = playerResponse?.videoDetails?.title || document.title.replace(' - YouTube', '');

    return {
        success: true,
        title: title,
        language: captionTrack.languageCode,
        languageName: captionTrack.name?.simpleText || captionTrack.languageCode,
        transcript: transcript
    };
}

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