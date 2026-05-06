const express = require('express');
const cors = require('cors');
const youtubedl = require('youtube-dl-exec');
const ffmpegPath = require('ffmpeg-static');
const { spawn } = require('child_process');
const app = express();

app.use(cors());
app.use(express.static('public'));

app.get('/info', async (req, res) => {
    const videoURL = req.query.url ? req.query.url.trim() : null;
    if (!videoURL) return res.status(400).json({ error: 'URL is required' });

    try {
        const info = await youtubedl(videoURL, {
            dumpSingleJson: true,
            noCheckCertificates: true,
            noWarnings: true,
        });

        const bestAudio = info.formats
            .filter(f => f.vcodec === 'none' && f.acodec !== 'none' && (f.ext === 'm4a' || f.acodec.includes('mp4a')))
            .sort((a, b) => (b.filesize || 0) - (a.filesize || 0))[0];
        
        const audioUrl = bestAudio ? bestAudio.url : null;
        const audioSize = bestAudio ? (bestAudio.filesize || bestAudio.filesize_approx || 0) : 0;

        const seenHeights = new Set();
        const formats = info.formats
            .filter(f => f.vcodec !== 'none') 
            .sort((a, b) => (b.height || 0) - (a.height || 0))
            .filter(f => {
                const h = f.height;
                if (!h || seenHeights.has(h)) return false;
                seenHeights.add(h);
                return true;
            })
            .map(f => {
                let totalSize = f.filesize || f.filesize_approx || 0;
                const needsMerge = f.acodec === 'none';
                if (needsMerge && audioSize) totalSize += audioSize;

                return {
                    itag: f.format_id,
                    qualityLabel: `${f.height}p`,
                    sizeBytes: totalSize,
                    sizeDisplay: totalSize > 0 ? formatBytes(totalSize) : 'Unknown',
                    videoUrl: f.url,
                    audioUrl: needsMerge ? audioUrl : null,
                    isProgressive: !needsMerge
                };
            });

        res.json({
            title: info.title,
            thumbnail: info.thumbnail,
            formats: formats
        });
    } catch (err) {
        console.error('API Error:', err);
        res.status(500).json({ error: err.message || 'Extraction failed' });
    }
});

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

app.get('/download', async (req, res) => {
    const { videoUrl, audioUrl, title, size, isProgressive } = req.query;

    if (!videoUrl) return res.status(400).send('Missing video URL');

    const fileName = (title || 'video').replace(/[^\x00-\x7F]/g, "").replace(/[\\/:*?"<>|]/g, "");
    res.header('Content-Disposition', `attachment; filename="${fileName}.mp4"`);
    res.header('Content-Type', 'video/mp4');
    if (size && size > 0) res.header('Content-Length', size);

    // If it's a progressive format (already has audio), redirect for 0ms delay
    if (isProgressive === 'true') {
        return res.redirect(videoUrl);
    }

    // For high-quality, use ffmpeg to merge URLs directly (much faster than spawning yt-dlp again)
    const args = [
        '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5',
        '-i', videoUrl,
        '-i', audioUrl,
        '-c', 'copy', // Zero CPU usage, just muxing
        '-f', 'mp4',
        '-movflags', 'frag_keyframe+empty_moov+faststart',
        'pipe:1'
    ];

    const ffmpeg = spawn(ffmpegPath, args);
    ffmpeg.stdout.pipe(res);
    
    req.on('close', () => ffmpeg.kill());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Extreme speed server on port ${PORT}`));
