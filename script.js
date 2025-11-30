document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const browseBtn = document.getElementById('browseBtn');
    const editorArea = document.getElementById('editorArea');
    const imagePreview = document.getElementById('imagePreview');
    const fileNameDisplay = document.getElementById('fileName');
    const originalSizeDisplay = document.getElementById('originalSize');
    const formatSelect = document.getElementById('formatSelect');
    const targetSizeInput = document.getElementById('targetSizeInput');
    const sizeLimitsDisplay = document.getElementById('sizeLimits');
    const convertBtn = document.getElementById('convertBtn');
    const resetBtn = document.getElementById('resetBtn');

    // State
    let currentFile = null;

    // --- Event Listeners ---
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(() => dropZone.classList.add('drag-over'));
    ['dragleave', 'drop'].forEach(() => dropZone.classList.remove('drag-over'));

    dropZone.addEventListener('drop', handleDrop);
    browseBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
    resetBtn.addEventListener('click', resetApp);
    formatSelect.addEventListener('change', () => calculateSizeLimits());
    convertBtn.addEventListener('click', handleConversion);

    // --- Core Functions ---

    function handleDrop(e) {
        const dt = e.dataTransfer;
        handleFiles(dt.files);
    }

    function handleFiles(files) {
        if (files.length > 0) {
            const file = files[0];
            if (file.type.startsWith('image/')) {
                currentFile = file;
                loadFile(file);
            } else {
                alert('Please upload a valid image file.');
            }
        }
    }

    function loadFile(file) {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onloadend = () => {
            imagePreview.src = reader.result;
            fileNameDisplay.textContent = file.name;
            originalSizeDisplay.textContent = formatBytes(file.size);

            dropZone.classList.add('hidden');
            editorArea.classList.remove('hidden');

            imagePreview.onload = () => calculateSizeLimits();
        };
    }

    function resetApp() {
        currentFile = null;
        fileInput.value = '';
        imagePreview.src = '';
        targetSizeInput.value = '';
        dropZone.classList.remove('hidden');
        editorArea.classList.add('hidden');
        sizeLimitsDisplay.classList.remove('visible');
    }

    // Helper: Creates canvas with White Background (fixes transparent PNG to JPG black issue)
    function getCanvas(img, width, height, format) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        // Enable high quality scaling
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        if (format === 'image/jpeg') {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        ctx.drawImage(img, 0, 0, width, height);
        return canvas;
    }

    function estimateSizeKB(dataUrl) {
        const head = 'data:image/*;base64,'.length;
        return ((dataUrl.length - head) * 0.75) / 1024;
    }

    async function calculateSizeLimits() {
        if (!currentFile || !imagePreview.src) return;
        const format = formatSelect.value;
        
        // Use original dimensions for limits
        const canvas = getCanvas(imagePreview, imagePreview.naturalWidth, imagePreview.naturalHeight, format);

        if (format === 'image/png') {
            sizeLimitsDisplay.textContent = 'PNG size targeting is limited';
            sizeLimitsDisplay.classList.add('visible');
            targetSizeInput.placeholder = "Not recommended for PNG";
            return;
        }

        targetSizeInput.disabled = false;
        targetSizeInput.placeholder = "Auto";

        // Calculate theoretical limits at full resolution
        const minSize = Math.round(estimateSizeKB(canvas.toDataURL(format, 0.05)));
        const maxSize = Math.round(estimateSizeKB(canvas.toDataURL(format, 1.0)));

        sizeLimitsDisplay.textContent = `Est. Range: ${minSize}KB - ${maxSize}KB (will resize if smaller)`;
        sizeLimitsDisplay.classList.add('visible');
    }

    async function handleConversion() {
        if (!currentFile) return;

        const format = formatSelect.value;
        const targetSize = parseFloat(targetSizeInput.value);
        
        let width = imagePreview.naturalWidth;
        let height = imagePreview.naturalHeight;
        let quality = 0.92;
        let canvas = getCanvas(imagePreview, width, height, format);
        
        // --- SMART RESIZING LOGIC ---
        // If a target size is set, we check if we need to shrink dimensions
        if (targetSize && format !== 'image/png') {
            
            // 1. Step Down Dimensions until quality > 0.1 is possible
            // We loop: If the image at lowest quality (0.1) is STILL bigger than target,
            // we shrink dimensions by 20% and try again.
            let attempts = 0;
            while (attempts < 10) {
                const lowQualUrl = canvas.toDataURL(format, 0.1);
                const estimatedLowSize = estimateSizeKB(lowQualUrl);

                if (estimatedLowSize <= targetSize) {
                    break; // Fits! We can now tune quality.
                }

                // If too big, shrink dimensions
                width *= 0.8; 
                height *= 0.8;
                canvas = getCanvas(imagePreview, width, height, format);
                attempts++;
            }

            // 2. Binary Search for Quality (to hit exact size)
            let minQ = 0.05;
            let maxQ = 1.0;
            
            for (let i = 0; i < 10; i++) {
                let midQ = (minQ + maxQ) / 2;
                let dataUrl = canvas.toDataURL(format, midQ);
                let size = estimateSizeKB(dataUrl);

                if (Math.abs(size - targetSize) < (targetSize * 0.05)) { // 5% tolerance
                    quality = midQ;
                    break;
                }
                
                if (size > targetSize) maxQ = midQ;
                else minQ = midQ;
                
                quality = midQ;
            }
        }

        const finalDataUrl = canvas.toDataURL(format, quality);
        downloadImage(finalDataUrl, format);
    }

    function downloadImage(dataUrl, format) {
        const link = document.createElement('a');
        const ext = format.split('/')[1];
        const originalName = currentFile.name.split('.')[0];
        link.download = `${originalName}_fem_${Date.now()}.${ext}`;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + ['Bytes', 'KB', 'MB', 'GB', 'TB'][i];
    }
});
