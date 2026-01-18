// popup.js

let allVideos = [];
let transcriptData = null;

// Initialisation : détecter le type de page
document.addEventListener('DOMContentLoaded', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url || '';

    const status = document.getElementById('status');
    const pageTitle = document.getElementById('pageTitle');

    if (url.includes('youtube.com/results')) {
        // Page de recherche
        pageTitle.textContent = 'YouTube Bulk Scraper';
        document.getElementById('scraperSection').classList.remove('hidden');
        status.textContent = 'Prêt';
    } else if (url.includes('youtube.com/watch')) {
        // Page vidéo
        pageTitle.textContent = 'YouTube Transcript';
        document.getElementById('transcriptSection').classList.remove('hidden');
        status.textContent = 'Prêt';
    } else {
        // Autre page
        document.getElementById('errorSection').classList.remove('hidden');
        status.textContent = '';
    }
});

// ============ SCRAPER ============

document.getElementById('startBtn').addEventListener('click', async () => {
    const startBtn = document.getElementById('startBtn');
    const copyBtn = document.getElementById('copyBtn');
    const filterContainer = document.getElementById('filterContainer');
    const status = document.getElementById('status');
    const listContainer = document.getElementById('videoList');

    listContainer.replaceChildren();
    listContainer.classList.add('hidden');
    copyBtn.classList.add('hidden');
    filterContainer.classList.add('hidden');
    status.textContent = "Initialisation...";

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.url || !tab.url.includes("youtube.com/results")) {
        status.textContent = "Erreur : Allez sur une recherche YouTube.";
        status.style.color = "#d32f2f";
        return;
    }

    startBtn.disabled = true;
    startBtn.textContent = "Extraction en cours...";
    status.textContent = "Scroll & Analyse...";
    status.style.color = "#666";

    try {
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            });
        } catch (e) { }

        await new Promise(r => setTimeout(r, 500));

        const response = await chrome.tabs.sendMessage(tab.id, { action: "SCRAPE_URLS", limit: 50 });

        if (response && response.status === "DONE") {
            allVideos = response.data;
            filterContainer.classList.remove('hidden');
            applyFilter();
            copyBtn.classList.remove('hidden');
        } else {
            throw new Error("Réponse vide");
        }

    } catch (error) {
        console.error(error);
        status.textContent = "Erreur. Rechargez la page.";
        status.style.color = "#d32f2f";
    } finally {
        startBtn.disabled = false;
        startBtn.textContent = "Relancer l'extraction";
    }
});

function renderList(videos) {
    const listContainer = document.getElementById('videoList');
    listContainer.replaceChildren();
    listContainer.classList.remove('hidden');

    videos.forEach((video, index) => {
        const row = document.createElement('div');
        row.className = 'video-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = true;
        checkbox.id = `vid-${index}`;
        checkbox.dataset.url = video.url;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'video-content';

        const label = document.createElement('label');
        label.className = 'video-title';
        label.htmlFor = `vid-${index}`;
        label.textContent = video.title;

        const dateSpan = document.createElement('span');
        dateSpan.className = 'video-date';
        dateSpan.textContent = video.dateText;

        contentDiv.appendChild(label);
        contentDiv.appendChild(dateSpan);

        row.appendChild(checkbox);
        row.appendChild(contentDiv);

        listContainer.appendChild(row);
    });
}

document.getElementById('copyBtn').addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('.video-item input[type="checkbox"]:checked');
    const urls = Array.from(checkboxes).map(cb => cb.dataset.url);

    if (urls.length === 0) {
        document.getElementById('status').textContent = "Aucune vidéo sélectionnée.";
        return;
    }

    navigator.clipboard.writeText(urls.join('\n')).then(() => {
        const btn = document.getElementById('copyBtn');
        const originalText = btn.textContent;
        btn.textContent = "Copié !";
        setTimeout(() => { btn.textContent = originalText; }, 2000);
    });
});

document.getElementById('dateFilter').addEventListener('change', applyFilter);

function applyFilter() {
    const filterValue = document.getElementById('dateFilter').value;
    const now = Date.now();
    const status = document.getElementById('status');

    const durations = {
        week: 7 * 24 * 60 * 60 * 1000,
        month: 30 * 24 * 60 * 60 * 1000,
        '6months': 180 * 24 * 60 * 60 * 1000,
        year: 365 * 24 * 60 * 60 * 1000
    };

    let filteredVideos;
    if (filterValue === 'all') {
        filteredVideos = allVideos;
    } else {
        const maxAge = durations[filterValue];
        filteredVideos = allVideos.filter(video => (now - video.timestamp) <= maxAge);
    }

    renderList(filteredVideos);
    status.textContent = `${filteredVideos.length}/${allVideos.length} vidéos affichées`;
    status.style.color = "#2e7d32";
}

// ============ TRANSCRIPT ============

document.getElementById('transcriptBtn').addEventListener('click', async () => {
    const transcriptBtn = document.getElementById('transcriptBtn');
    const status = document.getElementById('status');
    const transcriptResult = document.getElementById('transcriptResult');

    transcriptBtn.disabled = true;
    transcriptBtn.textContent = "Extraction en cours...";
    status.textContent = "Récupération du transcript...";
    status.style.color = "#666";
    transcriptResult.classList.add('hidden');

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    try {
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            });
        } catch (e) { }

        await new Promise(r => setTimeout(r, 300));

        const response = await chrome.tabs.sendMessage(tab.id, { action: "GET_TRANSCRIPT" });

        if (response && response.success) {
            transcriptData = response;
            displayTranscript();
            transcriptResult.classList.remove('hidden');

            document.getElementById('transcriptInfo').textContent =
                `${response.title} • Langue : ${response.languageName} • ${response.transcript.length} segments`;

            status.textContent = "Transcript extrait avec succès";
            status.style.color = "#2e7d32";
        } else {
            throw new Error(response?.error || "Erreur inconnue");
        }

    } catch (error) {
        console.error(error);
        status.textContent = error.message || "Erreur lors de l'extraction";
        status.style.color = "#d32f2f";
    } finally {
        transcriptBtn.disabled = false;
        transcriptBtn.textContent = "Extraire le transcript";
    }
});

document.getElementById('showTimestamps').addEventListener('change', displayTranscript);

function displayTranscript() {
    if (!transcriptData) return;

    const showTimestamps = document.getElementById('showTimestamps').checked;
    const textarea = document.getElementById('transcriptText');

    const text = transcriptData.transcript.map(item => {
        if (showTimestamps) {
            return `[${item.timestamp}] ${item.text}`;
        }
        return item.text;
    }).join('\n');

    textarea.value = text;
}

document.getElementById('copyTranscriptBtn').addEventListener('click', () => {
    const textarea = document.getElementById('transcriptText');

    navigator.clipboard.writeText(textarea.value).then(() => {
        const btn = document.getElementById('copyTranscriptBtn');
        const originalText = btn.textContent;
        btn.textContent = "Copié !";
        setTimeout(() => { btn.textContent = originalText; }, 2000);
    });
});
