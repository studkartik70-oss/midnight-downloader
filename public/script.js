const CONFIG = {
    // Replace this with your actual backend URL after deploying to Render/Railway
    // If empty, it will default to the current domain (works for local development)
    BACKEND_URL: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? '' 
        : 'https://midnight-downloader.onrender.com' 
};

const urlInput = document.getElementById('urlInput');
const analyzeBtn = document.getElementById('analyzeBtn');
const resultArea = document.getElementById('resultArea');
const loading = document.getElementById('loading');

analyzeBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    if (!url) return;

    // Reset UI
    resultArea.classList.add('hidden');
    loading.classList.remove('hidden');

    try {
        const response = await fetch(`${CONFIG.BACKEND_URL}/info?url=${encodeURIComponent(url)}`);
        const data = await response.json();

        if (data.error) {
            alert(data.error);
            loading.classList.add('hidden');
            return;
        }

        displayResults(data);
        loading.classList.add('hidden');
        resultArea.classList.remove('hidden');

    } catch (err) {
        alert('Server unreachable. Make sure the backend is running.');
        loading.classList.add('hidden');
    }
});

function displayResults(data) {
    document.getElementById('thumbnail').src = data.thumbnail;
    document.getElementById('videoTitle').innerText = data.title;
    // Note: data.author is available if the backend provides it, but my latest backend (System2.0) used youtube-dl which might have different keys.
    // Let's stick to title and formats for now.
    
    const formatList = document.getElementById('formatList');
    formatList.innerHTML = '';

    data.formats.forEach(format => {
        const chip = document.createElement('div');
        chip.className = 'format-chip';
        chip.innerText = `${format.qualityLabel} (${format.sizeDisplay})`;
        chip.onclick = () => downloadVideo(data.title, format);
        formatList.appendChild(chip);
    });
}

function downloadVideo(title, format) {
    const params = new URLSearchParams({
        videoUrl: format.videoUrl,
        audioUrl: format.audioUrl || '',
        title: title,
        size: format.sizeBytes,
        isProgressive: format.isProgressive
    });

    // Use absolute URL to ensure it hits the backend correctly
    window.location.href = `${CONFIG.BACKEND_URL}/download?${params.toString()}`;
}

// Enter key support
urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') analyzeBtn.click();
});
