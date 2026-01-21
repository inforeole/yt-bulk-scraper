// popup.js
let allVideos = []; // Stocke toutes les vidéos pour le filtrage

document.getElementById('startBtn').addEventListener('click', async () => {
    const startBtn = document.getElementById('startBtn');
    const copyBtn = document.getElementById('copyBtn');
    const filterContainer = document.getElementById('filterContainer');
    const status = document.getElementById('status');
    const listContainer = document.getElementById('videoList');

    listContainer.replaceChildren();
    listContainer.style.display = 'none';
    copyBtn.style.display = 'none';
    filterContainer.style.display = 'none';
    status.textContent = "Initialisation...";
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const isSearchPage = tab.url && tab.url.includes("youtube.com/results");
    const isPlaylistPage = tab.url && tab.url.includes("youtube.com/playlist");

    if (!isSearchPage && !isPlaylistPage) {
        status.textContent = "Erreur : Allez sur une recherche ou playlist YouTube.";
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
            filterContainer.style.display = 'block';
            applyFilter();
            copyBtn.style.display = 'block';
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
    listContainer.style.display = 'block';

    videos.forEach((video, index) => {
        const row = document.createElement('div');
        row.className = 'video-item';
        
        // Case à cocher
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = true;
        checkbox.id = `vid-${index}`;
        checkbox.dataset.url = video.url;
        
        // Conteneur Texte (Titre + Date)
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
        const originalText = document.getElementById('copyBtn').textContent;
        document.getElementById('copyBtn').textContent = "Copié !";
        setTimeout(() => {
            document.getElementById('copyBtn').textContent = originalText;
        }, 2000);
    });
});

// Filtre par date
document.getElementById('dateFilter').addEventListener('change', applyFilter);

function applyFilter() {
    const filterValue = document.getElementById('dateFilter').value;
    const now = Date.now();
    const status = document.getElementById('status');

    // Durées en millisecondes
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