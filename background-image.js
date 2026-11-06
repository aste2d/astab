'use strict';

(function attachBackgroundImage(globalScope) {
  const MAX_BACKGROUND_EDGE = 1920;
  const MAX_BACKGROUND_BYTES = 900 * 1024;
  const BACKGROUND_IMAGE_TYPE = 'image/webp';
  const BACKGROUND_IMAGE_QUALITIES = [0.82, 0.74, 0.66, 0.58, 0.5];
  const BACKGROUND_IMAGE_EDGE_STEPS = [1, 0.88, 0.76, 0.64];

  function constrainImageDimensions({ width, height, maxEdge = MAX_BACKGROUND_EDGE }) {
    const safeWidth = Math.max(1, Math.round(Number(width) || 0));
    const safeHeight = Math.max(1, Math.round(Number(height) || 0));
    const safeMaxEdge = Math.max(1, Math.round(Number(maxEdge) || MAX_BACKGROUND_EDGE));
    const largestEdge = Math.max(safeWidth, safeHeight);

    if (largestEdge <= safeMaxEdge) {
      return { width: safeWidth, height: safeHeight };
    }

    const scale = safeMaxEdge / largestEdge;
    return {
      width: Math.max(1, Math.round(safeWidth * scale)),
      height: Math.max(1, Math.round(safeHeight * scale)),
    };
  }

  function estimateDataUrlBytes(dataUrl) {
    const value = String(dataUrl || '');
    const marker = 'base64,';
    const markerIndex = value.indexOf(marker);
    if (markerIndex === -1) return 0;

    const payload = value.slice(markerIndex + marker.length);
    const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
  }

  function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();

      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Could not read image'));
      };
      image.src = objectUrl;
    });
  }

  async function compressImageFileForStorage(file, options = {}) {
    if (!file || !String(file.type || '').startsWith('image/')) {
      throw new Error('Please choose an image file');
    }

    const maxBytes = Math.max(32 * 1024, Number(options.maxBytes) || MAX_BACKGROUND_BYTES);
    const maxEdge = Math.max(320, Number(options.maxEdge) || MAX_BACKGROUND_EDGE);
    const image = await loadImageFromFile(file);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { alpha: false });

    if (!context) {
      throw new Error('Could not prepare image compression');
    }

    let bestDataUrl = '';
    let bestBytes = Number.POSITIVE_INFINITY;

    for (const edgeStep of BACKGROUND_IMAGE_EDGE_STEPS) {
      const dimensions = constrainImageDimensions({
        width: image.naturalWidth,
        height: image.naturalHeight,
        maxEdge: Math.max(320, Math.round(maxEdge * edgeStep)),
      });

      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      context.clearRect(0, 0, dimensions.width, dimensions.height);
      context.fillStyle = '#f6f0e6';
      context.fillRect(0, 0, dimensions.width, dimensions.height);
      context.drawImage(image, 0, 0, dimensions.width, dimensions.height);

      for (const quality of BACKGROUND_IMAGE_QUALITIES) {
        const dataUrl = canvas.toDataURL(BACKGROUND_IMAGE_TYPE, quality);
        const bytes = estimateDataUrlBytes(dataUrl);
        if (bytes < bestBytes) {
          bestBytes = bytes;
          bestDataUrl = dataUrl;
        }
        if (bytes <= maxBytes) {
          return dataUrl;
        }
      }
    }

    if (bestDataUrl) {
      throw new Error(`Image is too large even after compression (${Math.ceil(bestBytes / 1024)} KB)`);
    }

    throw new Error('Could not compress image');
  }

  const api = {
    BACKGROUND_IMAGE_TYPE,
    MAX_BACKGROUND_BYTES,
    MAX_BACKGROUND_EDGE,
    compressImageFileForStorage,
    constrainImageDimensions,
    estimateDataUrlBytes,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  globalScope.TabOutBackgroundImage = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
