/**
 * AI Pavilion - Storage Service (S3 Integration)
 */

import { CONFIG } from '../config/config.js';

class StorageService {
    constructor() {
        this.bucketUrl = CONFIG.s3?.bucketUrl || '';
    }

    // ==================== FILE UPLOAD ====================

    async uploadFile(file, path = '', onProgress = null) {
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('path', path);

            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();

                if (onProgress) {
                    xhr.upload.addEventListener('progress', (e) => {
                        if (e.lengthComputable) {
                            const percentComplete = (e.loaded / e.total) * 100;
                            onProgress(Math.round(percentComplete));
                        }
                    });
                }

                xhr.addEventListener('load', () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        const response = JSON.parse(xhr.responseText);
                        resolve(response);
                    } else {
                        reject(new Error(`Upload failed: ${xhr.statusText}`));
                    }
                });

                xhr.addEventListener('error', () => {
                    reject(new Error('Upload failed'));
                });

                xhr.open('POST', `${CONFIG.api.endpoint}/upload`);
                xhr.send(formData);
            });

        } catch (error) {
            console.error('Upload error:', error);
            throw error;
        }
    }

    async uploadMultiple(files, path = '', onProgress = null) {
        const uploads = files.map((file, index) => 
            this.uploadFile(file, path, (progress) => {
                if (onProgress) {
                    const totalProgress = ((index + progress / 100) / files.length) * 100;
                    onProgress(Math.round(totalProgress));
                }
            })
        );

        return Promise.all(uploads);
    }

    // ==================== FILE DOWNLOAD ====================

    getFileUrl(key) {
        if (!key) return '';
        if (key.startsWith('http')) return key;
        return `${this.bucketUrl}/${key}`;
    }

    async downloadFile(key, filename) {
        try {
            const url = this.getFileUrl(key);
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`Download failed: ${response.statusText}`);
            }

            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = filename || key.split('/').pop();
            link.click();

            URL.revokeObjectURL(objectUrl);

        } catch (error) {
            console.error('Download error:', error);
            throw error;
        }
    }

    // ==================== FILE INFO ====================

    async getFileInfo(key) {
        try {
            const url = this.getFileUrl(key);
            const response = await fetch(url, { method: 'HEAD' });

            if (!response.ok) {
                throw new Error(`Get file info failed: ${response.statusText}`);
            }

            return {
                size: parseInt(response.headers.get('content-length') || '0'),
                type: response.headers.get('content-type'),
                lastModified: new Date(response.headers.get('last-modified'))
            };

        } catch (error) {
            console.error('Get file info error:', error);
            return null;
        }
    }

    // ==================== UTILITIES ====================

    validateFile(file, options = {}) {
        const {
            maxSize = 10 * 1024 * 1024, // 10MB default
            allowedTypes = [],
            allowedExtensions = []
        } = options;

        // Check size
        if (file.size > maxSize) {
            throw new Error(`File size exceeds ${maxSize / 1024 / 1024}MB limit`);
        }

        // Check type
        if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
            throw new Error(`File type ${file.type} is not allowed`);
        }

        // Check extension
        if (allowedExtensions.length > 0) {
            const ext = file.name.split('.').pop().toLowerCase();
            if (!allowedExtensions.includes(ext)) {
                throw new Error(`File extension .${ext} is not allowed`);
            }
        }

        return true;
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    getFileExtension(filename) {
        return filename.split('.').pop().toLowerCase();
    }

    generateUniqueFilename(originalName) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 9);
        const ext = this.getFileExtension(originalName);
        const nameWithoutExt = originalName.replace(`.${ext}`, '');
        return `${nameWithoutExt}-${timestamp}-${random}.${ext}`;
    }
}

// ==================== SINGLETON INSTANCE ====================

export const storageService = new StorageService();

export default storageService;
