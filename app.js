/**
 * V-Stream Vault - Video Media Library & High Performance Player
 * Pure SVG UI, Modal-based Upload with Custom Title, Desc, Subtitles & Thumbnail
 */

(function () {
  'use strict';

  // ==========================================
  // 1. IndexedDB 資料庫管理模組 (Database Vault)
  // ==========================================
  const DB_NAME = 'VStreamMediaVault_v3';
  const DB_VERSION = 1;
  const STORE_NAME = 'videos';

  class MediaVaultDB {
    constructor() {
      this.db = null;
    }

    async init() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            store.createIndex('dateAdded', 'dateAdded', { unique: false });
            store.createIndex('category', 'category', { unique: false });
            store.createIndex('title', 'title', { unique: false });
          }
        };

        request.onsuccess = (e) => {
          this.db = e.target.result;
          resolve(this.db);
        };

        request.onerror = (e) => {
          console.error('IndexedDB 打開失敗:', e);
          reject(e);
        };
      });
    }

    async getAllVideos() {
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    }

    async saveVideo(videoData) {
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(videoData);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }

    async deleteVideo(id) {
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(id);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
      });
    }

    async deleteMultiple(ids) {
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        ids.forEach(id => store.delete(id));
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    }
  }

  const dbEngine = new MediaVaultDB();

  // ==========================================
  // 2. 應用狀態管理 (App State)
  // ==========================================
  const state = {
    videos: [],
    filteredVideos: [],
    currentCategory: 'all',
    searchQuery: '',
    sortBy: 'newest',
    viewMode: 'grid', // 'grid' or 'list'
    selectedVideoIds: new Set(),
    activePlayingVideo: null,
    editingVideoId: null,
    subtitlesEnabled: true
  };

  // 上傳彈窗暫存狀態
  const uploadDraft = {
    file: null,
    tempBlobUrl: null,
    duration: 0,
    width: 1920,
    height: 1080,
    resolution: '1080p FHD',
    thumbnail: null,
    extractedThumbAt: 1.0,
    isCustomImageThumb: false,
    subtitleFileName: '',
    subtitleCues: []
  };

  // ==========================================
  // 3. 工具函式 (Utilities)
  // ==========================================
  function formatDuration(seconds) {
    if (isNaN(seconds) || seconds < 0) return '0:00:00';
    const s = Math.floor(seconds);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    const mm = mins.toString().padStart(2, '0');
    const ss = secs.toString().padStart(2, '0');
    return `${hrs}:${mm}:${ss}`;
  }

  function formatBytes(bytes, decimals = 1) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  }

  function formatDate(timestamp) {
    if (!timestamp) return '未知日期';
    const d = new Date(timestamp);
    return `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}`;
  }

  function getCategoryLabel(cat) {
    const map = {
      all: '全部',
      animation: '動畫',
      movie: '電影',
      music: '音樂 MV',
      tutorial: '教學',
      lifestyle: '生活記錄',
      other: '其他'
    };
    return map[cat] || '影片';
  }

  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast-msg ${type}`;

    let iconUse = '#icon-bolt';
    if (type === 'success') iconUse = '#icon-check';
    if (type === 'error') iconUse = '#icon-close';

    toast.innerHTML = `
      <svg class="svg-icon"><use href="${iconUse}"></use></svg>
      <span>${message}</span>
    `;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(30px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  function generatePlaceholderSvg(title) {
    const cleanTitle = (title || 'Video').substring(0, 10);
    return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="100%" height="100%" fill="%230c1220"/><rect x="40" y="40" width="560" height="280" rx="12" fill="%23141d30" stroke="%2300a2ff" stroke-width="2" stroke-opacity="0.3"/><polygon points="290,140 370,180 290,220" fill="%2300a2ff"/><text x="320" y="270" font-family="sans-serif" font-size="20" fill="%2394a3b8" text-anchor="middle">${encodeURIComponent(cleanTitle)}</text></svg>`;
  }

  // ==========================================
  // 4. 初始化 App
  // ==========================================
  async function initApp() {
    await dbEngine.init();
    state.videos = await dbEngine.getAllVideos();
    setupEventListeners();
    updateUI();
  }

  // ==========================================
  // 5. 畫面渲染邏輯 (UI Rendering)
  // ==========================================
  function updateUI() {
    filterAndSortVideos();
    renderStats();
    renderLibrary();
    updateBatchBar();
    updateHeaderBadge();
  }

  function updateHeaderBadge() {
    const countEl = document.getElementById('header-video-count');
    if (countEl) countEl.textContent = state.videos.length;
  }

  function renderStats() {
    const totalCount = state.videos.length;
    const totalDurationSeconds = state.videos.reduce((acc, cur) => acc + (cur.duration || 0), 0);
    const totalBytes = state.videos.reduce((acc, cur) => acc + (cur.size || 0), 0);

    const hrs = Math.floor(totalDurationSeconds / 3600);
    const mins = Math.floor((totalDurationSeconds % 3600) / 60);

    document.getElementById('stat-total-videos').textContent = `${totalCount} 部`;
    document.getElementById('stat-total-duration').textContent = `${hrs} 小時 ${mins} 分`;
    document.getElementById('stat-storage-used').textContent = formatBytes(totalBytes);
  }

  function filterAndSortVideos() {
    let list = [...state.videos];

    // 分類篩選
    if (state.currentCategory !== 'all') {
      list = list.filter(v => v.category === state.currentCategory);
    }

    // 關鍵字搜尋
    if (state.searchQuery.trim()) {
      const q = state.searchQuery.toLowerCase().trim();
      list = list.filter(v =>
        (v.title && v.title.toLowerCase().includes(q)) ||
        (v.desc && v.desc.toLowerCase().includes(q))
      );
    }

    // 排序
    switch (state.sortBy) {
      case 'newest':
        list.sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));
        break;
      case 'duration-desc':
        list.sort((a, b) => (b.duration || 0) - (a.duration || 0));
        break;
      case 'duration-asc':
        list.sort((a, b) => (a.duration || 0) - (b.duration || 0));
        break;
      case 'size-desc':
        list.sort((a, b) => (b.size || 0) - (a.size || 0));
        break;
      case 'title-asc':
        list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        break;
    }

    state.filteredVideos = list;
  }

  function renderLibrary() {
    const container = document.getElementById('library-container');
    const emptyState = document.getElementById('library-empty-state');
    container.innerHTML = '';

    if (state.filteredVideos.length === 0) {
      emptyState.classList.remove('hidden');
      container.classList.add('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    container.classList.remove('hidden');

    container.className = `library-container ${state.viewMode === 'grid' ? 'grid-mode video-grid' : 'list-mode'}`;

    state.filteredVideos.forEach(video => {
      container.appendChild(createVideoCard(video));
    });
  }

  function createVideoCard(video) {
    const card = document.createElement('div');
    card.className = 'video-card';
    card.dataset.id = video.id;

    const isSelected = state.selectedVideoIds.has(video.id);
    if (isSelected) card.classList.add('selected');

    const percent = video.duration ? Math.min(100, Math.round((video.progressSeconds / video.duration) * 100)) : 0;
    const progressBarHtml = percent > 0 ? `
      <div class="card-progress-bar">
        <div class="card-progress-fill" style="width: ${percent}%;"></div>
      </div>
    ` : '';

    const hasSubtitles = video.subtitles && video.subtitles.length > 0;
    const subBadgeHtml = hasSubtitles ? `<span class="res-badge" style="left: auto; right: 8px; background: rgba(16, 185, 129, 0.85); color: #fff;">CC 字幕</span>` : '';

    card.innerHTML = `
      <div class="card-thumb-wrap">
        <input type="checkbox" class="card-select-checkbox custom-checkbox" ${isSelected ? 'checked' : ''} style="position: absolute; top: 10px; right: 10px; z-index: 5;">
        <img src="${video.thumbnail || generatePlaceholderSvg(video.title)}" class="card-thumb" alt="${video.title}">
        <div class="thumb-play-overlay">
          <div class="play-circle-btn">
            <svg class="svg-icon"><use href="#icon-play"></use></svg>
          </div>
        </div>
        <span class="res-badge">${video.resolution || 'HD'}</span>
        ${subBadgeHtml}
        <span class="duration-badge">${formatDuration(video.duration)}</span>
        ${progressBarHtml}
      </div>
      <div class="card-body">
        <div class="card-title-row">
          <h3 class="card-title" title="${video.title}">${video.title}</h3>
          <button class="card-menu-btn" title="編輯資訊">
            <svg class="svg-icon"><use href="#icon-edit"></use></svg>
          </button>
        </div>
        <div class="card-meta-row">
          <span>${formatDate(video.dateAdded)}・${formatBytes(video.size)}</span>
          <span class="card-category-tag">${getCategoryLabel(video.category)}</span>
        </div>
      </div>
    `;

    // 點選卡片播放
    card.addEventListener('click', (e) => {
      if (e.target.closest('.card-select-checkbox') || e.target.closest('.card-menu-btn')) return;
      openPlayer(video, video.progressSeconds || 0);
    });

    // 多選勾選
    const checkbox = card.querySelector('.card-select-checkbox');
    checkbox.addEventListener('change', (e) => {
      e.stopPropagation();
      if (checkbox.checked) {
        state.selectedVideoIds.add(video.id);
      } else {
        state.selectedVideoIds.delete(video.id);
      }
      updateBatchBar();
    });

    // 編輯資料
    const editBtn = card.querySelector('.card-menu-btn');
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditModal(video);
    });

    return card;
  }

  function updateBatchBar() {
    const bar = document.getElementById('batch-action-bar');
    const countEl = document.getElementById('batch-selected-count');
    const selectAllCheckbox = document.getElementById('batch-select-all-checkbox');

    if (state.selectedVideoIds.size > 0) {
      bar.classList.remove('hidden');
      countEl.textContent = state.selectedVideoIds.size;
      selectAllCheckbox.checked = state.selectedVideoIds.size === state.filteredVideos.length;
    } else {
      bar.classList.add('hidden');
      selectAllCheckbox.checked = false;
    }
  }

  // =========================================================
  // 7. 上傳彈窗核心模組 (Upload Modal & Custom Metadata)
  // =========================================================
  const uploadModal = {
    backdrop: document.getElementById('modal-upload-video'),
    fileDropzone: document.getElementById('modal-file-dropzone'),
    fileInput: document.getElementById('modal-file-input'),
    dropEmpty: document.getElementById('modal-drop-empty'),
    dropSelected: document.getElementById('modal-drop-selected'),
    selectedFileName: document.getElementById('selected-video-filename'),
    selectedVideoSpec: document.getElementById('selected-video-spec'),
    rechooseBtn: document.getElementById('btn-rechoose-file'),

    titleInput: document.getElementById('upload-video-title'),
    categorySelect: document.getElementById('upload-video-category'),
    descInput: document.getElementById('upload-video-desc'),

    thumbPreview: document.getElementById('upload-thumb-preview'),
    thumbSourceBadge: document.getElementById('thumb-preview-source'),
    frameSlider: document.getElementById('thumb-frame-slider'),
    frameTimeDisplay: document.getElementById('thumb-frame-time-display'),
    customImageBtn: document.getElementById('btn-upload-custom-image'),
    customImageInput: document.getElementById('custom-image-file-input'),
    resetThumbBtn: document.getElementById('btn-reset-extracted-thumb'),

    subtitleBtn: document.getElementById('btn-upload-subtitle-file'),
    subtitleInput: document.getElementById('subtitle-file-input'),
    subtitleStatus: document.getElementById('subtitle-status-display'),
    removeSubBtn: document.getElementById('btn-remove-subtitle'),

    progressWrap: document.getElementById('modal-upload-progress-wrap'),
    progressStatus: document.getElementById('modal-upload-progress-status'),
    progressPercent: document.getElementById('modal-upload-progress-percent'),
    progressFill: document.getElementById('modal-upload-progress-fill'),

    cancelBtn: document.getElementById('btn-cancel-upload-modal'),
    closeBtn: document.getElementById('btn-close-upload-modal'),
    confirmBtn: document.getElementById('btn-confirm-add-video')
  };

  function openUploadModal() {
    resetUploadModal();
    uploadModal.backdrop.classList.remove('hidden');
  }

  function closeUploadModal() {
    uploadModal.backdrop.classList.add('hidden');
    if (uploadDraft.tempBlobUrl) {
      URL.revokeObjectURL(uploadDraft.tempBlobUrl);
      uploadDraft.tempBlobUrl = null;
    }
  }

  function resetUploadModal() {
    uploadDraft.file = null;
    if (uploadDraft.tempBlobUrl) {
      URL.revokeObjectURL(uploadDraft.tempBlobUrl);
      uploadDraft.tempBlobUrl = null;
    }
    uploadDraft.duration = 0;
    uploadDraft.width = 1920;
    uploadDraft.height = 1080;
    uploadDraft.resolution = '1080p FHD';
    uploadDraft.thumbnail = null;
    uploadDraft.extractedThumbAt = 1.0;
    uploadDraft.isCustomImageThumb = false;
    uploadDraft.subtitleFileName = '';
    uploadDraft.subtitleCues = [];

    uploadModal.fileInput.value = '';
    uploadModal.dropEmpty.classList.remove('hidden');
    uploadModal.dropSelected.classList.add('hidden');

    uploadModal.titleInput.value = '';
    uploadModal.categorySelect.value = 'animation';
    uploadModal.descInput.value = '';

    uploadModal.thumbPreview.src = generatePlaceholderSvg('預覽縮圖');
    uploadModal.thumbSourceBadge.textContent = '尚未選取影片';
    uploadModal.frameSlider.disabled = true;
    uploadModal.frameSlider.value = 1;
    uploadModal.frameTimeDisplay.textContent = '0:00:01';

    uploadModal.subtitleStatus.textContent = '未附加字幕';
    uploadModal.subtitleStatus.classList.remove('text-green');
    uploadModal.removeSubBtn.classList.add('hidden');

    uploadModal.progressWrap.classList.add('hidden');
    uploadModal.progressFill.style.width = '0%';
    uploadModal.confirmBtn.disabled = true;
  }

  async function handleFileSelectedInModal(file) {
    if (!file || !file.type.startsWith('video/')) {
      showToast('請選取正確的影片格式檔案 (MP4/WebM/MKV 等)', 'error');
      return;
    }

    uploadDraft.file = file;
    uploadDraft.tempBlobUrl = URL.createObjectURL(file);

    // 切換拖曳盒顯示
    uploadModal.dropEmpty.classList.add('hidden');
    uploadModal.dropSelected.classList.remove('hidden');
    uploadModal.selectedFileName.textContent = file.name;
    uploadModal.selectedVideoSpec.textContent = `${formatBytes(file.size)}・解析規格中...`;

    // 自動填入名稱
    const cleanName = file.name.replace(/\.[^/.]+$/, '');
    uploadModal.titleInput.value = cleanName;
    uploadModal.categorySelect.value = guessCategoryFromName(file.name);

    // 解析影片資訊並擷取縮圖
    const meta = await extractVideoMetadataAndThumb(file, uploadDraft.tempBlobUrl, 1.0);
    uploadDraft.duration = meta.duration;
    uploadDraft.width = meta.width;
    uploadDraft.height = meta.height;
    uploadDraft.resolution = meta.resolution;
    uploadDraft.thumbnail = meta.thumbnail;
    uploadDraft.extractedThumbAt = 1.0;

    uploadModal.selectedVideoSpec.textContent = `${meta.resolution}・${formatDuration(meta.duration)}・${formatBytes(file.size)}`;

    // 更新縮圖預覽與時間軸拉桿
    uploadModal.thumbPreview.src = meta.thumbnail;
    uploadModal.thumbSourceBadge.textContent = '自動擷取自 0:00:01';
    uploadModal.frameSlider.disabled = false;
    uploadModal.frameSlider.max = Math.max(1, Math.floor(meta.duration));
    uploadModal.frameSlider.value = 1;
    uploadModal.frameTimeDisplay.textContent = formatDuration(1);

    uploadModal.confirmBtn.disabled = false;
  }

  function guessCategoryFromName(name) {
    const n = name.toLowerCase();
    if (n.includes('mv') || n.includes('music') || n.includes('song') || n.includes('音樂')) return 'music';
    if (n.includes('anim') || n.includes('動漫') || n.includes('動畫') || n.includes('cartoon')) return 'animation';
    if (n.includes('movie') || n.includes('film') || n.includes('電影')) return 'movie';
    if (n.includes('tut') || n.includes('教學') || n.includes('learn') || n.includes('課程')) return 'tutorial';
    return 'lifestyle';
  }

  function extractVideoMetadataAndThumb(file, blobUrl, seekTime = 1.0) {
    return new Promise((resolve) => {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.src = blobUrl;
      v.muted = true;
      v.playsInline = true;

      v.onloadedmetadata = () => {
        const targetTime = Math.min(v.duration, Math.max(0.1, seekTime));
        v.currentTime = targetTime;
      };

      v.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 480;
          canvas.height = 270;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
          const thumbData = canvas.toDataURL('image/jpeg', 0.88);

          const w = v.videoWidth || 1920;
          const h = v.videoHeight || 1080;
          let res = '1080p FHD';
          if (w >= 3840 || h >= 2160) res = '4K UHD';
          else if (w >= 1920 || h >= 1080) res = '1080p FHD';
          else if (w >= 1280 || h >= 720) res = '720p HD';
          else res = 'SD';

          resolve({
            duration: v.duration || 60,
            width: w,
            height: h,
            resolution: res,
            thumbnail: thumbData
          });
        } catch (e) {
          resolve({
            duration: v.duration || 60,
            width: 1920,
            height: 1080,
            resolution: '1080p FHD',
            thumbnail: generatePlaceholderSvg(file.name)
          });
        }
      };

      v.onerror = () => {
        resolve({
          duration: 60,
          width: 1920,
          height: 1080,
          resolution: '1080p FHD',
          thumbnail: generatePlaceholderSvg(file.name)
        });
      };
    });
  }

  // 重新擷取特定秒數幀
  async function reExtractFrameAt(seconds) {
    if (!uploadDraft.tempBlobUrl) return;
    const meta = await extractVideoMetadataAndThumb(uploadDraft.file, uploadDraft.tempBlobUrl, seconds);
    uploadDraft.thumbnail = meta.thumbnail;
    uploadDraft.extractedThumbAt = seconds;
    uploadDraft.isCustomImageThumb = false;

    uploadModal.thumbPreview.src = meta.thumbnail;
    uploadModal.thumbSourceBadge.textContent = `影格畫面於 ${formatDuration(seconds)}`;
  }

  // 解析 SRT 或 WebVTT 字幕內容
  function parseSubtitleText(text) {
    const cues = [];
    // 統一換行
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const blocks = normalized.split(/\n\n+/);

    for (const block of blocks) {
      const lines = block.trim().split('\n');
      if (lines.length < 2) continue;

      let timeLine = '';
      let textLines = [];

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('-->')) {
          timeLine = lines[i];
          textLines = lines.slice(i + 1);
          break;
        }
      }

      if (timeLine) {
        const parts = timeLine.split('-->');
        if (parts.length === 2) {
          const start = parseTimestampToSeconds(parts[0].trim());
          const end = parseTimestampToSeconds(parts[1].trim());
          const cueText = textLines.join('\n').replace(/<[^>]+>/g, '').trim();
          if (!isNaN(start) && !isNaN(end) && cueText) {
            cues.push({ start, end, text: cueText });
          }
        }
      }
    }
    return cues;
  }

  function parseTimestampToSeconds(str) {
    // 格式可能為 00:01:20,000 或 00:01:20.000 或 01:20.000
    const clean = str.replace(',', '.');
    const parts = clean.split(':');
    if (parts.length === 3) {
      return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
    } else if (parts.length === 2) {
      return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
    }
    return NaN;
  }

  // 執行確認新增
  async function submitUploadVideo() {
    if (!uploadDraft.file) return;

    const title = uploadModal.titleInput.value.trim() || uploadDraft.file.name;
    const category = uploadModal.categorySelect.value;
    const desc = uploadModal.descInput.value.trim() || `本機新增影片，原始格式 ${uploadDraft.resolution}。`;

    uploadModal.confirmBtn.disabled = true;
    uploadModal.progressWrap.classList.remove('hidden');

    // 模擬極速本機寫入動畫
    await new Promise(resolve => {
      let pct = 0;
      const timer = setInterval(() => {
        pct += 25;
        if (pct >= 100) {
          clearInterval(timer);
          uploadModal.progressFill.style.width = '100%';
          uploadModal.progressPercent.textContent = '100%';
          uploadModal.progressStatus.textContent = '匯入完成！';
          resolve();
        } else {
          uploadModal.progressFill.style.width = `${pct}%`;
          uploadModal.progressPercent.textContent = `${pct}%`;
        }
      }, 30);
    });

    const fileId = 'vid_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

    const videoRecord = {
      id: fileId,
      title: title,
      desc: desc,
      category: category,
      duration: uploadDraft.duration,
      size: uploadDraft.file.size,
      type: uploadDraft.file.type,
      resolution: uploadDraft.resolution,
      thumbnail: uploadDraft.thumbnail || generatePlaceholderSvg(title),
      fileBlob: uploadDraft.file,
      subtitles: uploadDraft.subtitleCues,
      dateAdded: Date.now(),
      lastWatched: null,
      progressSeconds: 0
    };

    await dbEngine.saveVideo(videoRecord);
    state.videos.unshift(videoRecord);

    closeUploadModal();
    updateUI();
    showToast(`成功新增影片「${title}」！`, 'success');
  }

  // =========================================================
  // 8. 專業極簡播放器核心 (Strictly Matching Screenshot Design)
  // =========================================================
  const player = {
    overlay: document.getElementById('player-view'),
    stage: document.getElementById('player-stage'),
    video: document.getElementById('main-video-element'),
    subtitleCue: document.getElementById('player-subtitle-cue'),
    titleDisplay: document.getElementById('player-title-display'),
    playPauseBtn: document.getElementById('btn-player-play-pause'),
    playPauseIconUse: document.getElementById('icon-use-play-pause'),
    rewindBtn: document.getElementById('btn-player-rewind'),
    forwardBtn: document.getElementById('btn-player-forward'),
    volumeBtn: document.getElementById('btn-player-volume'),
    volumeIconUse: document.getElementById('icon-use-volume'),
    volumeSlider: document.getElementById('volume-range-input'),
    timeCurrent: document.getElementById('time-current'),
    timeDuration: document.getElementById('time-duration'),
    progressContainer: document.getElementById('player-progress-container'),
    progressCurrentFill: document.getElementById('progress-current-fill'),
    progressBufferFill: document.getElementById('progress-buffer-fill'),
    progressThumb: document.getElementById('progress-scrubber-thumb'),
    tooltip: document.getElementById('scrubber-tooltip'),
    captionsBtn: document.getElementById('btn-player-captions'),
    captionsIconUse: document.getElementById('icon-use-captions'),
    pipBtn: document.getElementById('btn-player-pip'),
    settingsBtn: document.getElementById('btn-player-settings'),
    settingsPopover: document.getElementById('settings-popover'),
    fullscreenBtn: document.getElementById('btn-player-fullscreen'),
    fullscreenIconUse: document.getElementById('icon-use-fullscreen'),
    backBtn: document.getElementById('btn-player-back'),
    centerIndicator: document.getElementById('center-play-indicator'),
    centerIconUse: document.getElementById('center-icon-use'),
    spinner: document.getElementById('player-spinner'),
    isScrubbing: false,
    controlsTimeout: null,
    activeVideoObj: null,
    currentBlobUrl: null
  };

  function openPlayer(videoObj, startFrom = 0) {
    player.activeVideoObj = videoObj;
    player.titleDisplay.textContent = videoObj.title || '影片名稱';

    if (player.currentBlobUrl) {
      URL.revokeObjectURL(player.currentBlobUrl);
      player.currentBlobUrl = null;
    }

    if (videoObj.fileBlob) {
      player.currentBlobUrl = URL.createObjectURL(videoObj.fileBlob);
      player.video.src = player.currentBlobUrl;
    } else if (videoObj.url) {
      player.video.src = videoObj.url;
    }

    player.overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // 字幕按鈕高亮
    updateCaptionsButtonState();

    player.video.currentTime = startFrom || 0;
    player.video.play().then(() => {
      updatePlayPauseIcons(true);
    }).catch(() => {
      updatePlayPauseIcons(false);
    });

    resetControlsTimer();
  }

  function closePlayer() {
    if (player.activeVideoObj) {
      const currentTime = Math.floor(player.video.currentTime);
      player.activeVideoObj.progressSeconds = currentTime;
      player.activeVideoObj.lastWatched = Date.now();
      dbEngine.saveVideo(player.activeVideoObj);
    }

    player.video.pause();
    player.overlay.classList.add('hidden');
    document.body.style.overflow = '';
    player.subtitleCue.classList.add('hidden');

    if (player.currentBlobUrl) {
      URL.revokeObjectURL(player.currentBlobUrl);
      player.currentBlobUrl = null;
    }

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => { });
    }

    updateUI();
  }

  function updatePlayPauseIcons(isPlaying) {
    player.playPauseIconUse.setAttribute('href', isPlaying ? '#icon-pause' : '#icon-play');
  }

  function updateCaptionsButtonState() {
    const hasSubs = player.activeVideoObj && player.activeVideoObj.subtitles && player.activeVideoObj.subtitles.length > 0;
    if (state.subtitlesEnabled && hasSubs) {
      player.captionsBtn.classList.add('active-cyan');
    } else {
      player.captionsBtn.classList.remove('active-cyan');
      player.subtitleCue.classList.add('hidden');
    }
  }

  function togglePlayPause() {
    if (player.video.paused) {
      player.video.play();
      triggerCenterIndicator('#icon-play');
      updatePlayPauseIcons(true);
    } else {
      player.video.pause();
      triggerCenterIndicator('#icon-pause');
      updatePlayPauseIcons(false);
    }
  }

  function triggerCenterIndicator(iconId) {
    player.centerIconUse.setAttribute('href', iconId);
    player.centerIndicator.classList.remove('animate-pop');
    void player.centerIndicator.offsetWidth;
    player.centerIndicator.classList.add('animate-pop');
    setTimeout(() => {
      player.centerIndicator.classList.remove('animate-pop');
    }, 450);
  }

  function resetControlsTimer() {
    player.stage.classList.remove('controls-hidden');
    clearTimeout(player.controlsTimeout);
    if (!player.video.paused) {
      player.controlsTimeout = setTimeout(() => {
        if (!player.settingsPopover.classList.contains('hidden') || player.isScrubbing) return;
        player.stage.classList.add('controls-hidden');
      }, 3500);
    }
  }

  function updateProgressDisplay() {
    const cur = player.video.currentTime;
    const dur = player.video.duration || player.activeVideoObj?.duration || 0;

    player.timeCurrent.textContent = formatDuration(cur);
    player.timeDuration.textContent = formatDuration(dur);

    if (!player.isScrubbing && dur > 0) {
      const pct = (cur / dur) * 100;
      player.progressCurrentFill.style.width = `${pct}%`;
      player.progressThumb.style.left = `${pct}%`;
    }

    if (player.video.buffered.length > 0 && dur > 0) {
      const bufferedEnd = player.video.buffered.end(player.video.buffered.length - 1);
      const bufPct = (bufferedEnd / dur) * 100;
      player.progressBufferFill.style.width = `${Math.min(100, bufPct)}%`;
    }

    // 字幕同步計算
    renderSubtitlesAtTime(cur);
  }

  function renderSubtitlesAtTime(currentTime) {
    if (!state.subtitlesEnabled || !player.activeVideoObj || !player.activeVideoObj.subtitles) {
      player.subtitleCue.classList.add('hidden');
      return;
    }

    const currentCue = player.activeVideoObj.subtitles.find(
      cue => currentTime >= cue.start && currentTime <= cue.end
    );

    if (currentCue) {
      player.subtitleCue.textContent = currentCue.text;
      player.subtitleCue.classList.remove('hidden');
    } else {
      player.subtitleCue.classList.add('hidden');
    }
  }

  function handleScrub(e) {
    const rect = player.progressContainer.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const dur = player.video.duration || player.activeVideoObj?.duration || 0;

    const pct = pos * 100;
    player.progressCurrentFill.style.width = `${pct}%`;
    player.progressThumb.style.left = `${pct}%`;

    return pos * dur;
  }

  // ==========================================
  // 9. 事件綁定 (Event Listeners)
  // ==========================================
  function setupEventListeners() {
    // 點擊 Logo 重置搜尋並回到初始影片庫
    document.getElementById('nav-brand').addEventListener('click', (e) => {
      e.preventDefault();
      state.searchQuery = '';
      state.currentCategory = 'all';
      document.getElementById('global-search-input').value = '';
      document.getElementById('btn-clear-search').classList.add('hidden');
      document.querySelectorAll('#category-filters .filter-chip').forEach(c => c.classList.remove('active'));
      document.querySelector('#category-filters .filter-chip[data-category="all"]').classList.add('active');
      updateUI();
    });

    // 點擊上傳按鈕開啟上傳彈窗
    document.getElementById('btn-trigger-upload-modal').addEventListener('click', openUploadModal);
    document.getElementById('btn-empty-upload-open').addEventListener('click', openUploadModal);

    // 搜尋功能
    const searchInput = document.getElementById('global-search-input');
    const clearSearchBtn = document.getElementById('btn-clear-search');

    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      if (state.searchQuery) {
        clearSearchBtn.classList.remove('hidden');
      } else {
        clearSearchBtn.classList.add('hidden');
      }
      updateUI();
    });

    clearSearchBtn.addEventListener('click', () => {
      searchInput.value = '';
      state.searchQuery = '';
      clearSearchBtn.classList.add('hidden');
      updateUI();
    });

    // 分類 Chip 切換
    document.querySelectorAll('#category-filters .filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#category-filters .filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.currentCategory = chip.dataset.category;
        updateUI();
      });
    });

    // 排序切換
    const sortSelect = document.getElementById('library-sort-select');
    sortSelect.addEventListener('change', (e) => {
      state.sortBy = e.target.value;
      updateUI();
    });

    // 網格 / 列表檢視切換
    const btnGrid = document.getElementById('btn-view-grid');
    const btnList = document.getElementById('btn-view-list');

    btnGrid.addEventListener('click', () => {
      state.viewMode = 'grid';
      btnGrid.classList.add('active');
      btnList.classList.remove('active');
      renderLibrary();
    });

    btnList.addEventListener('click', () => {
      state.viewMode = 'list';
      btnList.classList.add('active');
      btnGrid.classList.remove('active');
      renderLibrary();
    });

    // 批次操作
    document.getElementById('batch-select-all-checkbox').addEventListener('change', (e) => {
      if (e.target.checked) {
        state.filteredVideos.forEach(v => state.selectedVideoIds.add(v.id));
      } else {
        state.selectedVideoIds.clear();
      }
      updateUI();
    });

    document.getElementById('btn-batch-cancel').addEventListener('click', () => {
      state.selectedVideoIds.clear();
      updateUI();
    });

    document.getElementById('btn-batch-delete').addEventListener('click', async () => {
      if (state.selectedVideoIds.size === 0) return;
      if (confirm(`確定要刪除選取的 ${state.selectedVideoIds.size} 部影片嗎？`)) {
        await dbEngine.deleteMultiple(Array.from(state.selectedVideoIds));
        state.videos = state.videos.filter(v => !state.selectedVideoIds.has(v.id));
        state.selectedVideoIds.clear();
        updateUI();
        showToast('已成功批次刪除影片', 'info');
      }
    });

    // ==========================================
    // 上傳彈窗內部事件 (Upload Modal Events)
    // ==========================================
    uploadModal.closeBtn.addEventListener('click', closeUploadModal);
    uploadModal.cancelBtn.addEventListener('click', closeUploadModal);

    // 點選拖放區選取檔案
    uploadModal.fileDropzone.addEventListener('click', (e) => {
      if (e.target === uploadModal.rechooseBtn) return;
      uploadModal.fileInput.click();
    });

    uploadModal.fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleFileSelectedInModal(e.target.files[0]);
      }
    });

    uploadModal.rechooseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      uploadModal.fileInput.click();
    });

    // 拖曳進入與放下
    ['dragenter', 'dragover'].forEach(eventName => {
      uploadModal.fileDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadModal.fileDropzone.classList.add('drag-over');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      uploadModal.fileDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadModal.fileDropzone.classList.remove('drag-over');
      });
    });

    uploadModal.fileDropzone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      if (dt && dt.files && dt.files[0]) {
        handleFileSelectedInModal(dt.files[0]);
      }
    });

    // 影格時間軸拖曳擷取縮圖
    uploadModal.frameSlider.addEventListener('input', (e) => {
      const sec = parseFloat(e.target.value);
      uploadModal.frameTimeDisplay.textContent = formatDuration(sec);
    });

    uploadModal.frameSlider.addEventListener('change', async (e) => {
      const sec = parseFloat(e.target.value);
      await reExtractFrameAt(sec);
    });

    // 上傳自訂封面圖 (JPG/PNG)
    uploadModal.customImageBtn.addEventListener('click', () => {
      uploadModal.customImageInput.click();
    });

    uploadModal.customImageInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        const imgFile = e.target.files[0];
        const reader = new FileReader();
        reader.onload = (ev) => {
          uploadDraft.thumbnail = ev.target.result;
          uploadDraft.isCustomImageThumb = true;
          uploadModal.thumbPreview.src = ev.target.result;
          uploadModal.thumbSourceBadge.textContent = '使用者自訂封面圖片';
          showToast('已設定自訂封面圖片', 'success');
        };
        reader.readAsDataURL(imgFile);
      }
    });

    // 重設為影片擷取縮圖
    uploadModal.resetThumbBtn.addEventListener('click', async () => {
      if (uploadDraft.tempBlobUrl) {
        await reExtractFrameAt(parseFloat(uploadModal.frameSlider.value) || 1.0);
        showToast('已重設為影片畫面', 'info');
      }
    });

    // 選取字幕檔 (.vtt / .srt)
    uploadModal.subtitleBtn.addEventListener('click', () => {
      uploadModal.subtitleInput.click();
    });

    uploadModal.subtitleInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        const subFile = e.target.files[0];
        const reader = new FileReader();
        reader.onload = (ev) => {
          const cues = parseSubtitleText(ev.target.result);
          uploadDraft.subtitleFileName = subFile.name;
          uploadDraft.subtitleCues = cues;

          uploadModal.subtitleStatus.textContent = `已附加：${subFile.name} (${cues.length} 條對白)`;
          uploadModal.subtitleStatus.classList.add('text-green');
          uploadModal.removeSubBtn.classList.remove('hidden');
          showToast(`成功載入字幕檔，共 ${cues.length} 條對白`, 'success');
        };
        reader.readAsText(subFile);
      }
    });

    uploadModal.removeSubBtn.addEventListener('click', () => {
      uploadDraft.subtitleFileName = '';
      uploadDraft.subtitleCues = [];
      uploadModal.subtitleInput.value = '';
      uploadModal.subtitleStatus.textContent = '未附加字幕';
      uploadModal.subtitleStatus.classList.remove('text-green');
      uploadModal.removeSubBtn.classList.add('hidden');
      showToast('已移除字幕檔', 'info');
    });

    // 確認新增按鈕
    uploadModal.confirmBtn.addEventListener('click', submitUploadVideo);

    // ==========================================
    // 播放器控制事件 (Player Controls)
    // ==========================================
    player.backBtn.addEventListener('click', closePlayer);
    player.playPauseBtn.addEventListener('click', togglePlayPause);
    player.video.addEventListener('click', togglePlayPause);

    // 倒帶 / 快進 10 秒
    player.rewindBtn.addEventListener('click', () => {
      player.video.currentTime = Math.max(0, player.video.currentTime - 10);
      triggerCenterIndicator('#icon-rewind');
      resetControlsTimer();
    });

    player.forwardBtn.addEventListener('click', () => {
      player.video.currentTime = Math.min(player.video.duration, player.video.currentTime + 10);
      triggerCenterIndicator('#icon-forward');
      resetControlsTimer();
    });

    // 音量與靜音
    player.volumeBtn.addEventListener('click', () => {
      player.video.muted = !player.video.muted;
      updateVolumeUI();
    });

    player.volumeSlider.addEventListener('input', (e) => {
      player.video.volume = parseFloat(e.target.value);
      player.video.muted = (player.video.volume === 0);
      updateVolumeUI();
    });

    function updateVolumeUI() {
      if (player.video.muted || player.video.volume === 0) {
        player.volumeIconUse.setAttribute('href', '#icon-volume-mute');
        player.volumeSlider.value = 0;
      } else {
        player.volumeIconUse.setAttribute('href', '#icon-volume-high');
        player.volumeSlider.value = player.video.volume;
      }
    }

    player.video.addEventListener('timeupdate', updateProgressDisplay);

    player.video.addEventListener('waiting', () => {
      player.spinner.classList.remove('hidden');
    });

    player.video.addEventListener('playing', () => {
      player.spinner.classList.add('hidden');
      updatePlayPauseIcons(true);
    });

    player.video.addEventListener('pause', () => {
      updatePlayPauseIcons(false);
      player.stage.classList.remove('controls-hidden');
    });

    player.video.addEventListener('ended', () => {
      updatePlayPauseIcons(false);
      player.stage.classList.remove('controls-hidden');
    });

    // 進度條拖曳
    const onScrubMove = (e) => {
      if (!player.isScrubbing) return;
      handleScrub(e);
    };

    const onScrubUp = (e) => {
      if (!player.isScrubbing) return;
      player.isScrubbing = false;
      const targetTime = handleScrub(e);
      player.video.currentTime = targetTime;
      window.removeEventListener('mousemove', onScrubMove);
      window.removeEventListener('mouseup', onScrubUp);
    };

    player.progressContainer.addEventListener('mousedown', (e) => {
      player.isScrubbing = true;
      handleScrub(e);
      window.addEventListener('mousemove', onScrubMove);
      window.addEventListener('mouseup', onScrubUp);
    });

    player.progressContainer.addEventListener('mousemove', (e) => {
      const rect = player.progressContainer.getBoundingClientRect();
      const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const dur = player.video.duration || player.activeVideoObj?.duration || 0;
      const hoverTime = pos * dur;

      player.tooltip.textContent = formatDuration(hoverTime);
      player.tooltip.style.left = `${pos * 100}%`;
      player.tooltip.classList.remove('hidden');
    });

    player.progressContainer.addEventListener('mouseleave', () => {
      player.tooltip.classList.add('hidden');
    });

    // 全螢幕切換
    player.fullscreenBtn.addEventListener('click', toggleFullscreen);

    function toggleFullscreen() {
      if (!document.fullscreenElement) {
        player.overlay.requestFullscreen().catch(() => { });
      } else {
        document.exitFullscreen().catch(() => { });
      }
    }

    document.addEventListener('fullscreenchange', () => {
      if (document.fullscreenElement) {
        player.fullscreenIconUse.setAttribute('href', '#icon-fullscreen-exit');
      } else {
        player.fullscreenIconUse.setAttribute('href', '#icon-fullscreen');
      }
    });

    // 畫中畫
    player.pipBtn.addEventListener('click', async () => {
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else if (document.pictureInPictureEnabled) {
          await player.video.requestPictureInPicture();
        }
      } catch (err) {
        showToast('畫中畫模式受瀏覽器支援限制', 'info');
      }
    });

    // 字幕 CC 按鈕開關
    player.captionsBtn.addEventListener('click', () => {
      state.subtitlesEnabled = !state.subtitlesEnabled;
      updateCaptionsButtonState();
      showToast(state.subtitlesEnabled ? '已開啟字幕顯示' : '已關閉字幕顯示', 'info');
    });

    // 設定齒輪
    player.settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      player.settingsPopover.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!player.settingsPopover.contains(e.target) && e.target !== player.settingsBtn) {
        player.settingsPopover.classList.add('hidden');
      }
    });

    // 倍速調整
    document.querySelectorAll('#speed-options .speed-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#speed-options .speed-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        player.video.playbackRate = parseFloat(btn.dataset.speed);
        showToast(`播放速度：${btn.dataset.speed}x`, 'info');
      });
    });

    // 循環播放
    document.getElementById('toggle-loop-playback').addEventListener('change', (e) => {
      player.video.loop = e.target.checked;
      showToast(e.target.checked ? '已開啟循環播放' : '已關閉循環播放', 'info');
    });

    // 畫面比例
    document.querySelectorAll('#aspect-options .speed-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#aspect-options .speed-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        player.video.style.objectFit = btn.dataset.fit;
      });
    });

    player.stage.addEventListener('mousemove', resetControlsTimer);

    // 鍵盤快捷鍵
    window.addEventListener('keydown', (e) => {
      if (player.overlay.classList.contains('hidden')) return;
      if (['input', 'textarea'].includes(document.activeElement.tagName.toLowerCase())) return;

      switch (e.code) {
        case 'Space':
        case 'KeyK':
          e.preventDefault();
          togglePlayPause();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          player.video.currentTime = Math.max(0, player.video.currentTime - 5);
          triggerCenterIndicator('#icon-rewind');
          break;
        case 'ArrowRight':
          e.preventDefault();
          player.video.currentTime = Math.min(player.video.duration, player.video.currentTime + 5);
          triggerCenterIndicator('#icon-forward');
          break;
        case 'ArrowUp':
          e.preventDefault();
          player.video.volume = Math.min(1, player.video.volume + 0.1);
          updateVolumeUI();
          break;
        case 'ArrowDown':
          e.preventDefault();
          player.video.volume = Math.max(0, player.video.volume - 0.1);
          updateVolumeUI();
          break;
        case 'KeyF':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'KeyM':
          e.preventDefault();
          player.video.muted = !player.video.muted;
          updateVolumeUI();
          break;
        case 'KeyC':
          e.preventDefault();
          state.subtitlesEnabled = !state.subtitlesEnabled;
          updateCaptionsButtonState();
          showToast(state.subtitlesEnabled ? '已開啟字幕顯示' : '已關閉字幕顯示', 'info');
          break;
        case 'Escape':
          e.preventDefault();
          closePlayer();
          break;
      }
      resetControlsTimer();
    });

    setupEditModal();
  }

  // ==========================================
  // 10. 編輯 Modal 邏輯
  // ==========================================
  function setupEditModal() {
    const modal = document.getElementById('modal-edit-video');
    const closeBtn = document.getElementById('btn-close-edit-modal');
    const cancelBtn = document.getElementById('btn-cancel-edit');
    const confirmBtn = document.getElementById('btn-confirm-edit');

    const close = () => modal.classList.add('hidden');

    closeBtn.addEventListener('click', close);
    cancelBtn.addEventListener('click', close);

    confirmBtn.addEventListener('click', async () => {
      const id = document.getElementById('edit-video-id').value;
      const target = state.videos.find(v => v.id === id);
      if (target) {
        target.title = document.getElementById('edit-title-input').value.trim() || target.title;
        target.category = document.getElementById('edit-category-select').value;
        target.desc = document.getElementById('edit-desc-input').value.trim();

        await dbEngine.saveVideo(target);
        updateUI();
        showToast('影片資料更新成功', 'success');
      }
      close();
    });
  }

  function openEditModal(video) {
    const modal = document.getElementById('modal-edit-video');
    document.getElementById('edit-video-id').value = video.id;
    document.getElementById('edit-title-input').value = video.title;
    document.getElementById('edit-category-select').value = video.category;
    document.getElementById('edit-desc-input').value = video.desc || '';
    modal.classList.remove('hidden');
  }

  window.addEventListener('DOMContentLoaded', initApp);
})();
