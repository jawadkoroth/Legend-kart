'use client';

import { useState, useRef, useEffect, useCallback, type DragEvent, type ChangeEvent } from 'react';
import { deleteFile, getPublicUrl } from '@/lib/media';
import styles from './ProductMediaManager.module.css';

/* ------------------------------------------------------------------ */
/* Types & Helpers                                                    */
/* ------------------------------------------------------------------ */

export interface ProductMedia {
  url: string;
  type: 'image' | 'video';
}

interface ProductMediaManagerProps {
  value: ProductMedia[];
  onChange: (media: ProductMedia[]) => void;
  folder?: string;
  maxFiles?: number;
}

interface UploadingProgressEntry {
  id: string;
  name: string;
  previewUrl: string;
  type: 'image' | 'video';
  progress: number;
}

function getMediaType(file: File): 'image' | 'video' {
  if (file.type.startsWith('video/')) return 'video';
  return 'image';
}

/* ------------------------------------------------------------------ */
/* XHR Upload Helper with Progress                                    */
/* ------------------------------------------------------------------ */

function uploadFileWithProgress(
  file: File,
  folder: string,
  onProgress: (percent: number) => void
): Promise<{ url: string; path: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/admin/upload');

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          if (res.success && res.data) {
            resolve({ url: res.data.url, path: res.data.path });
          } else {
            reject(new Error(res.error || 'Upload failed'));
          }
        } catch (e) {
          reject(new Error('Failed to parse response'));
        }
      } else {
        try {
          const res = JSON.parse(xhr.responseText);
          reject(new Error(res.error || `Upload failed (${xhr.status})`));
        } catch (e) {
          reject(new Error(`Upload failed (${xhr.status})`));
        }
      }
    };

    xhr.onerror = () => reject(new Error('Network connection error'));
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', folder);
    xhr.send(formData);
  });
}

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

export default function ProductMediaManager({
  value,
  onChange,
  folder = 'products',
  maxFiles = 15,
}: ProductMediaManagerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState<UploadingProgressEntry[]>([]);
  const [replaceIndex, setReplaceIndex] = useState<number | null>(null);
  const [error, setError] = useState('');
  
  // Drag-and-drop reorder state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    return () => {
      // Clean up object URLs on unmount
      setUploading((prev) => {
        prev.forEach((e) => URL.revokeObjectURL(e.previewUrl));
        return [];
      });
    };
  }, []);

  const remaining = maxFiles - value.length - uploading.length;
  const isMaxed = remaining <= 0;

  /* ---------------------------------------------------------------- */
  /* Upload Logic                                                     */
  /* ---------------------------------------------------------------- */

  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      setError('');
      const fileArray = Array.from(files).slice(0, Math.max(0, remaining));

      if (fileArray.length === 0) {
        if (isMaxed) setError(`Maximum ${maxFiles} media items reached`);
        return;
      }

      const entries: UploadingProgressEntry[] = fileArray.map((file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        previewUrl: URL.createObjectURL(file),
        type: getMediaType(file),
        progress: 0,
      }));

      setUploading((prev) => [...prev, ...entries]);

      const results = await Promise.allSettled(
        fileArray.map(async (file, idx) => {
          const result = await uploadFileWithProgress(
            file,
            folder,
            (percent) => {
              setUploading((prev) =>
                prev.map((e) =>
                  e.id === entries[idx].id ? { ...e, progress: percent } : e
                )
              );
            }
          );
          URL.revokeObjectURL(entries[idx].previewUrl);
          return { entryId: entries[idx].id, path: result.path, type: getMediaType(file) };
        })
      );

      const newMedia: ProductMedia[] = [];
      const completedIds = new Set<string>();
      const errors: string[] = [];

      for (const result of results) {
        if (result.status === 'fulfilled') {
          newMedia.push({
            url: result.value.path,
            type: result.value.type,
          });
          completedIds.add(result.value.entryId);
        } else {
          errors.push(result.reason instanceof Error ? result.reason.message : 'Upload failed');
        }
      }

      setUploading((prev) => prev.filter((entry) => !completedIds.has(entry.id)));

      // Clean up failed preview links
      for (const entry of entries) {
        if (!completedIds.has(entry.id)) {
          URL.revokeObjectURL(entry.previewUrl);
        }
      }

      if (newMedia.length > 0) {
        onChange([...valueRef.current, ...newMedia]);
      }

      if (errors.length > 0) {
        setError(errors.join('; '));
      }
    },
    [remaining, isMaxed, maxFiles, folder, onChange]
  );

  /* ---------------------------------------------------------------- */
  /* Drag & Drop Reordering (HTML5)                                   */
  /* ---------------------------------------------------------------- */

  const handleDragStart = (e: DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOverCard = (e: DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    setDragOverIndex(index);
  };

  const handleDragLeaveCard = () => {
    setDragOverIndex(null);
  };

  const handleDropCard = (e: DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(null);
    if (draggedIndex === null || draggedIndex === index) return;

    const next = [...value];
    const [moved] = next.splice(draggedIndex, 1);
    next.splice(index, 0, moved);
    
    onChange(next);
    setDraggedIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  /* ---------------------------------------------------------------- */
  /* Drop Zone Drag & Drop                                            */
  /* ---------------------------------------------------------------- */

  function handleDragEnterZone(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }

  function handleDragLeaveZone(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }

  function handleDropZone(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files?.length) {
      processFiles(e.dataTransfer.files);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Replacement logic                                                */
  /* ---------------------------------------------------------------- */

  function triggerReplace(idx: number) {
    setReplaceIndex(idx);
    replaceInputRef.current?.click();
  }

  async function handleReplaceFile(e: ChangeEvent<HTMLInputElement>) {
    if (replaceIndex === null || !e.target.files?.length) return;
    const file = e.target.files[0];
    const idx = replaceIndex;
    setReplaceIndex(null);
    e.target.value = '';
    setError('');

    const targetId = crypto.randomUUID();
    const tempProgressEntry: UploadingProgressEntry = {
      id: targetId,
      name: file.name,
      previewUrl: URL.createObjectURL(file),
      type: getMediaType(file),
      progress: 0,
    };

    setUploading((prev) => [...prev, tempProgressEntry]);

    try {
      const oldPath = value[idx].url;
      const result = await uploadFileWithProgress(file, folder, (percent) => {
        setUploading((prev) =>
          prev.map((e) => (e.id === targetId ? { ...e, progress: percent } : e))
        );
      });

      // Update value array replacing at the index
      const next = [...valueRef.current];
      next[idx] = { url: result.path, type: getMediaType(file) };
      onChange(next);

      // Clean up old file (best effort)
      if (oldPath && !oldPath.startsWith('http') && !oldPath.startsWith('/')) {
        try {
          await deleteFile(oldPath);
        } catch (err) {
          console.error('[MEDIA_REPLACE_DELETE_FAILED]', err);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to replace file');
    } finally {
      URL.revokeObjectURL(tempProgressEntry.previewUrl);
      setUploading((prev) => prev.filter((e) => e.id !== targetId));
    }
  }

  /* ---------------------------------------------------------------- */
  /* Core Actions                                                     */
  /* ---------------------------------------------------------------- */

  async function handleRemove(index: number) {
    const path = value[index].url;
    const next = value.filter((_, i) => i !== index);
    onChange(next);

    if (path && !path.startsWith('http') && !path.startsWith('/')) {
      try {
        await deleteFile(path);
      } catch (err) {
        console.error('[MEDIA_DELETE_FAILED]', err);
      }
    }
  }

  function handleMoveLeft(index: number) {
    if (index <= 0) return;
    const next = [...value];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onChange(next);
  }

  function handleMoveRight(index: number) {
    if (index >= value.length - 1) return;
    const next = [...value];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    onChange(next);
  }

  return (
    <div className={styles.uploader}>
      {(value.length > 0 || uploading.length > 0) && (
        <div className={styles.mediaGrid}>
          {value.map((media, idx) => {
            const isDragged = draggedIndex === idx;
            const isDragOver = dragOverIndex === idx;
            const fullUrl = getPublicUrl(media.url);
            
            return (
              <div
                key={`${media.url}-${idx}`}
                className={`${styles.mediaCard} ${isDragOver ? styles.mediaCardHover : ''}`}
                style={{ opacity: isDragged ? 0.4 : 1 }}
                draggable
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={(e) => handleDragOverCard(e, idx)}
                onDragLeave={handleDragLeaveCard}
                onDrop={(e) => handleDropCard(e, idx)}
                onDragEnd={handleDragEnd}
              >
                {media.type === 'video' ? (
                  <div className={styles.videoContainer}>
                    <video src={fullUrl} className={styles.mediaPreview} muted preload="metadata" />
                    <div className={styles.playIconOverlay}>
                      <span className={styles.playIcon}>▶</span>
                    </div>
                  </div>
                ) : (
                  <img src={fullUrl} alt={`Product media ${idx + 1}`} className={styles.mediaPreview} loading="lazy" />
                )}

                <span className={styles.mediaTypeBadge}>{media.type}</span>

                <div className={styles.cardActions}>
                  <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={() => handleMoveLeft(idx)}
                    disabled={idx === 0}
                    title="Move Left"
                  >
                    ◀
                  </button>
                  <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={() => triggerReplace(idx)}
                    title="Replace file"
                  >
                    🔄
                  </button>
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.actionBtnRemove}`}
                    onClick={() => handleRemove(idx)}
                    title="Remove file"
                  >
                    ✕
                  </button>
                  <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={() => handleMoveRight(idx)}
                    disabled={idx === value.length - 1}
                    title="Move Right"
                  >
                    ▶
                  </button>
                </div>
              </div>
            );
          })}

          {uploading.map((entry) => (
            <div key={entry.id} className={styles.mediaCard}>
              <div className={styles.videoContainer}>
                {entry.type === 'video' ? (
                  <video src={entry.previewUrl} className={styles.mediaPreview} muted />
                ) : (
                  <img src={entry.previewUrl} alt="Uploading preview" className={styles.mediaPreview} />
                )}
                <div className={styles.uploadingOverlay}>
                  <div className={styles.spinner} />
                  <p className={styles.progressText}>UPLOADING {entry.progress}%</p>
                  <div className={styles.progressBarContainer}>
                    <div className={styles.progressBar} style={{ width: `${entry.progress}%` }} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        className={`${styles.dropZone} ${dragActive ? styles.dropZoneActive : ''} ${isMaxed ? styles.dropZoneDisabled : ''}`}
        onDragEnter={handleDragEnterZone}
        onDragLeave={handleDragLeaveZone}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDropZone}
        onClick={() => !isMaxed && fileInputRef.current?.click()}
      >
        <div className={styles.dropIcon}>📁</div>
        <p className={styles.dropText}>
          {isMaxed
            ? `Maximum ${maxFiles} media items reached`
            : 'Drag & drop images or videos here or click to browse'}
        </p>
        <p className={styles.dropHint}>JPG, PNG, WebP, MP4, MOV, WebM · Max 4MB each</p>
        
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
          multiple
          className={styles.fileInput}
          onChange={(e) => {
            if (e.target.files?.length) {
              processFiles(e.target.files);
              e.target.value = '';
            }
          }}
        />
      </div>

      <input
        ref={replaceInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
        className={styles.fileInput}
        onChange={handleReplaceFile}
      />

      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
