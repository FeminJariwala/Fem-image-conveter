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
    const sizeControlGroup = document.getElementById('sizeControlGroup');

    // State
    let currentFile = null;
    let minSizeKB = 0;
    let maxSizeKB = 0;

    // --- Event Listeners ---

    // Drag & Drop
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(() => {
        dropZone.classList.add('drag-over');
    });

    ['dragleave', 'drop'].forEach(() => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', handleDrop);

    // File Input
    browseBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

    // Controls
    resetBtn.addEventListener('click', resetApp);
    formatSelect.addEventListener('change', handleFormatChange);
    convertBtn.addEventListener('click', handleConversion);

    // --- Functions ---

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles(files);
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

            // Show editor, hide drop zone
            dropZone.classList.add('hidden');
            editorArea.classList.remove('hidden');

            // Initialize size calculations once image is loaded
            imagePreview.onload = () => {
                calculateSizeLimits();
            };
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

    function handleFormatChange() {
        calculateSizeLimits();
    }

    // Helper to setup canvas with white background
    function getCanvasWithImage(img, format) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true }); // Optimized for frequent reads
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        // FIX: Fill with white background if converting to JPG
        // This prevents transparent areas from turning black or "fading"
        if (format === 'image/jpeg') {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        ctx.drawImage(img, 0, 0);
        return canvas;
    }

    async function calculateSizeLimits() {
        if (!currentFile || !imagePreview.src) return;

        const format = formatSelect.value;
        const canvas = getCanvasWithImage(imagePreview, format);

        // Check if format supports quality adjustment
        if (format === 'image/png') {
            sizeLimitsDisplay.textContent = 'Size targeting not available for PNG';
            sizeLimitsDisplay.classList.add('visible');
            targetSizeInput.disabled = true;
            targetSizeInput.placeholder = "Not supported for PNG";
            return;
        }

        targetSizeInput.disabled = false;
        targetSizeInput.placeholder = "Auto";

        // Calculate Min Size (Quality 0.01)
        const minDataUrl = canvas.toDataURL(format, 0.01);
        minSizeKB = Math.round(estimateSizeKB(minDataUrl));

        // Calculate Max Size (Quality 1.0)
        const maxDataUrl = canvas.toDataURL(format, 1.0);
        maxSizeKB = Math.round(estimateSizeKB(maxDataUrl));

        sizeLimitsDisplay.textContent = `Min: ${minSizeKB}KB | Max: ${maxSizeKB}KB`;
        sizeLimitsDisplay.classList.add('visible');
    }

    function estimateSizeKB(dataUrl) {
        const head = 'data:image/*;base64,'.length;
        const sizeInBytes = (dataUrl.length - head) * 0.75;
        return sizeInBytes / 1024;
    }

    async function handleConversion() {
        if (!currentFile) return;

        const format = formatSelect.value;
        const targetSize = parseFloat(targetSizeInput.value);
        
        // Use the helper to get a canvas with white background properly set
        const canvas = getCanvasWithImage(imagePreview, format);

        let quality = 0.92; // Default high quality

        // If target size is specified and format supports it (JPG/WEBP)
        if (targetSize && format !== 'image/png') {
            if (targetSize < minSizeKB) {
                alert(`Target size is too low. Minimum possible is ${minSizeKB}KB. Using minimum quality.`);
                quality = 0.01;
            } else if (targetSize > maxSizeKB) {
                quality = 1.0; 
            } else {
                // Binary search for optimal quality
                let minQ = 0.01;
                let maxQ = 1.0;

                for (let i = 0; i < 15; i++) { // Increased iterations for precision
                    let midQ = (minQ + maxQ) / 2;
                    let dataUrl = canvas.toDataURL(format, midQ);
                    let size = estimateSizeKB(dataUrl);

                    if (Math.abs(size - targetSize) < 5) { 
                        quality = midQ;
                        break;
                    }

                    if (size > targetSize) {
                        maxQ = midQ;
                    } else {
                        minQ = midQ;
                    }
                    quality = midQ;
                }
            }
        }

        // Convert
        const finalDataUrl = canvas.toDataURL(format, quality);
        downloadImage(finalDataUrl, format);
    }

    function downloadImage(dataUrl, format) {
        const link = document.createElement('a');
        const ext = format.split('/')[1];
        // Create a cleaner filename
        const originalName = currentFile.name.split('.')[0];
        link.download = `${originalName}_converted.${ext}`;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }
});
