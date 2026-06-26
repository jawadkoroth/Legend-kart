'use client';

import { useState, useRef, type DragEvent } from 'react';
import { uploadFile, getPublicUrl } from '@/lib/media';
import styles from './ProductStoryBuilder.module.css';

/* ------------------------------------------------------------------ */
/* Types & Constants                                                  */
/* ------------------------------------------------------------------ */

export interface StorySection {
  id?: string;
  title: string;
  subtitle?: string | null;
  description: string;
  image_url: string;
  button_text?: string | null;
  button_url?: string | null;
  layout: 'left' | 'right';
  background: 'black' | 'dark-grey' | 'gold-accent';
  image_ratio: 'portrait' | 'landscape' | 'square';
  display_order: number;
  enabled: boolean;
}

interface ProductStoryBuilderProps {
  value: StorySection[];
  onChange: (sections: StorySection[]) => void;
}

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

export default function ProductStoryBuilder({
  value,
  onChange,
}: ProductStoryBuilderProps) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  /* ---------------------------------------------------------------- */
  /* Helper updates                                                   */
  /* ---------------------------------------------------------------- */

  const updateSection = (idx: number, fields: Partial<StorySection>) => {
    const next = value.map((item, i) => {
      if (i === idx) {
        return { ...item, ...fields };
      }
      return item;
    });
    onChange(next);
  };

  /* ---------------------------------------------------------------- */
  /* Image Uploader per Section                                       */
  /* ---------------------------------------------------------------- */

  const handleImageUpload = async (idx: number, file: File) => {
    setUploadingIdx(idx);
    try {
      const result = await uploadFile(file, 'stories');
      updateSection(idx, { image_url: result.path });
    } catch (err) {
      console.error('[STORY_IMAGE_UPLOAD_FAILED]', err);
      alert(err instanceof Error ? err.message : 'Image upload failed');
    } finally {
      setUploadingIdx(null);
    }
  };

  /* ---------------------------------------------------------------- */
  /* Reordering (HTML5 Drag & Drop)                                   */
  /* ---------------------------------------------------------------- */

  const handleDragStart = (e: DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    setDragOverIndex(index);
  };

  const handleDrop = (e: DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(null);
    if (draggedIndex === null || draggedIndex === index) return;

    const next = [...value];
    const [moved] = next.splice(draggedIndex, 1);
    next.splice(index, 0, moved);

    // Re-index display_order based on new order array
    const reindexed = next.map((item, idx) => ({
      ...item,
      display_order: idx,
    }));

    onChange(reindexed);
    setDraggedIndex(null);

    // Retain expanded state at the new index position
    if (activeIdx === draggedIndex) {
      setActiveIdx(index);
    } else if (activeIdx === index) {
      setActiveIdx(draggedIndex);
    }
  };

  /* ---------------------------------------------------------------- */
  /* CMS Actions                                                      */
  /* ---------------------------------------------------------------- */

  const handleAddSection = () => {
    const newSec: StorySection = {
      title: 'Premium Story Section',
      subtitle: 'Luxury Craftsmanship',
      description: 'Long-form editorial description highlighting premium fabric, comfort, and state of the art technology.',
      image_url: '',
      button_text: '',
      button_url: '',
      layout: value.length % 2 === 0 ? 'left' : 'right',
      background: 'black',
      image_ratio: 'portrait',
      display_order: value.length,
      enabled: true,
    };
    onChange([...value, newSec]);
    setActiveIdx(value.length);
  };

  const handleDuplicate = (idx: number) => {
    const original = value[idx];
    const duplicate: StorySection = {
      ...original,
      id: undefined, // remove database ID reference
      title: `${original.title} (Copy)`,
      display_order: idx + 1,
    };

    const next = [...value];
    next.splice(idx + 1, 0, duplicate);

    // Re-index all display orders
    const reindexed = next.map((item, i) => ({
      ...item,
      display_order: i,
    }));

    onChange(reindexed);
    setActiveIdx(idx + 1);
  };

  const handleDelete = (idx: number) => {
    const next = value.filter((_, i) => i !== idx);
    const reindexed = next.map((item, i) => ({
      ...item,
      display_order: i,
    }));
    onChange(reindexed);
    if (activeIdx === idx) {
      setActiveIdx(null);
    } else if (activeIdx !== null && activeIdx > idx) {
      setActiveIdx(activeIdx - 1);
    }
  };

  return (
    <div className={styles.builder}>
      {/* Editor Side */}
      <div className={styles.editorSide}>
        <div className={styles.storyList}>
          {value.map((item, idx) => {
            const isOpen = activeIdx === idx;
            const isDragged = draggedIndex === idx;
            const isDragOver = dragOverIndex === idx;

            return (
              <div
                key={idx}
                className={`${styles.storyCard} ${isOpen ? styles.storyCardActive : ''} ${isDragOver ? styles.storyCardActive : ''}`}
                style={{ opacity: isDragged ? 0.4 : 1 }}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragLeave={() => setDragOverIndex(null)}
                onDrop={(e) => handleDrop(e, idx)}
              >
                {/* Header / Collapse Bar */}
                <div
                  className={styles.cardHeader}
                  draggable
                  onDragStart={(e) => handleDragStart(e, idx)}
                  onDragEnd={() => {
                    setDraggedIndex(null);
                    setDragOverIndex(null);
                  }}
                  onClick={() => setActiveIdx(isOpen ? null : idx)}
                >
                  <div className={styles.headerLeft}>
                    <span className={styles.dragHandle}>☰</span>
                    <h3 className={styles.sectionTitle}>
                      {idx + 1}. {item.title || 'Untitled Section'}
                    </h3>
                  </div>
                  <div className={styles.headerRight} onClick={(e) => e.stopPropagation()}>
                    <span className={item.enabled ? styles.visibilityBadge : styles.visibilityBadgeDisabled}>
                      {item.enabled ? 'VISIBLE' : 'HIDDEN'}
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => handleDuplicate(idx)}
                      title="Duplicate section"
                    >
                      📑
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => handleDelete(idx)}
                      style={{ color: 'var(--error)' }}
                      title="Delete section"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Form Fields */}
                {isOpen && (
                  <div className={styles.cardBody}>
                    <div className={styles.imageRow}>
                      {item.image_url ? (
                        <img src={getPublicUrl(item.image_url)} className={styles.imagePreview} alt="Section Thumbnail" />
                      ) : (
                        <div className={styles.imagePlaceholder}>No Image</div>
                      )}
                      <div className={styles.imageInputGroup}>
                        <label className="input-label">Section Image</label>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            if (e.target.files?.length) {
                              handleImageUpload(idx, e.target.files[0]);
                            }
                          }}
                          disabled={uploadingIdx === idx}
                        />
                        {uploadingIdx === idx && <p style={{ fontSize: '10px', color: 'var(--gold)' }}>Uploading...</p>}
                      </div>
                    </div>

                    <div className="input-group">
                      <label className="input-label">Section Title</label>
                      <input
                        className="input-field"
                        value={item.title}
                        onChange={(e) => updateSection(idx, { title: e.target.value })}
                        required
                      />
                    </div>

                    <div className="input-group">
                      <label className="input-label">Subtitle (Optional)</label>
                      <input
                        className="input-field"
                        value={item.subtitle || ''}
                        onChange={(e) => updateSection(idx, { subtitle: e.target.value })}
                      />
                    </div>

                    <div className="input-group">
                      <label className="input-label">Description</label>
                      <textarea
                        className="input-field"
                        value={item.description}
                        onChange={(e) => updateSection(idx, { description: e.target.value })}
                        rows={4}
                        style={{ resize: 'vertical' }}
                      />
                    </div>

                    <div className="input-row">
                      <div className="input-group">
                        <label className="input-label">Button Text (Optional)</label>
                        <input
                          className="input-field"
                          value={item.button_text || ''}
                          onChange={(e) => updateSection(idx, { button_text: e.target.value })}
                          placeholder="e.g. SHOP NOW"
                        />
                      </div>
                      <div className="input-group">
                        <label className="input-label">Button Link (Optional)</label>
                        <input
                          className="input-field"
                          value={item.button_url || ''}
                          onChange={(e) => updateSection(idx, { button_url: e.target.value })}
                          placeholder="e.g. /products/new"
                        />
                      </div>
                    </div>

                    <div className={styles.fieldGrid}>
                      <div className="input-group">
                        <label className="input-label">Layout</label>
                        <select
                          className="input-field"
                          value={item.layout}
                          onChange={(e) => updateSection(idx, { layout: e.target.value as 'left' | 'right' })}
                        >
                          <option value="left">Image Left · Text Right</option>
                          <option value="right">Text Left · Image Right</option>
                        </select>
                      </div>

                      <div className="input-group">
                        <label className="input-label">Background</label>
                        <select
                          className="input-field"
                          value={item.background}
                          onChange={(e) => updateSection(idx, { background: e.target.value as any })}
                        >
                          <option value="black">Matte Black</option>
                          <option value="dark-grey">Dark Charcoal Grey</option>
                          <option value="gold-accent">Gold-accented Strip</option>
                        </select>
                      </div>

                      <div className="input-group">
                        <label className="input-label">Image Ratio</label>
                        <select
                          className="input-field"
                          value={item.image_ratio}
                          onChange={(e) => updateSection(idx, { image_ratio: e.target.value as any })}
                        >
                          <option value="portrait">Portrait (3:4)</option>
                          <option value="landscape">Landscape (16:9)</option>
                          <option value="square">Square (1:1)</option>
                        </select>
                      </div>
                    </div>

                    <div className={styles.actionRow}>
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                          userSelect: 'none',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={item.enabled}
                          onChange={(e) => updateSection(idx, { enabled: e.target.checked })}
                        />
                        Section Enabled
                      </label>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button type="button" className={styles.addBtn} onClick={handleAddSection}>
          + ADD STORY SECTION BLOCK
        </button>
      </div>

      {/* Preview Side */}
      <div className={styles.previewSide}>
        <div className={styles.previewHeader}>Editorial Story Live Preview</div>
        <div className={styles.previewScroll}>
          {value.filter((s) => s.enabled).length === 0 ? (
            <div className={styles.previewEmpty}>
              No enabled story sections. Add and enable a block above to preview its layout.
            </div>
          ) : (
            value
              .filter((s) => s.enabled)
              .map((section, index) => {
                const isLeft = section.layout === 'left';
                const isBlack = section.background === 'black';
                const isDarkGrey = section.background === 'dark-grey';
                
                let bgClass = styles.bgBlack;
                if (isDarkGrey) bgClass = styles.bgDarkGrey;
                else if (section.background === 'gold-accent') bgClass = styles.bgGoldAccent;

                let ratioClass = styles.ratioPortrait;
                if (section.image_ratio === 'landscape') ratioClass = styles.ratioLandscape;
                else if (section.image_ratio === 'square') ratioClass = styles.ratioSquare;

                return (
                  <div key={index} className={`${styles.sectionView} ${bgClass}`}>
                    <div className={`${styles.sectionContent} ${isLeft ? styles.layoutLeft : styles.layoutRight}`}>
                      
                      <div className={`${styles.imgFrame} ${ratioClass}`}>
                        {section.image_url ? (
                          <img
                            src={getPublicUrl(section.image_url)}
                            alt={section.title}
                            className={styles.previewImg}
                          />
                        ) : (
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Section Image</span>
                        )}
                      </div>

                      <div className={styles.textView}>
                        {section.subtitle && <h4 className={styles.viewSubtitle}>{section.subtitle}</h4>}
                        <h3 className={styles.viewTitle}>{section.title}</h3>
                        <p className={styles.viewDesc}>{section.description}</p>
                        {section.button_text && (
                          <button type="button" className={styles.viewBtn}>
                            {section.button_text}
                          </button>
                        )}
                      </div>

                    </div>
                  </div>
                );
              })
          )}
        </div>
      </div>
    </div>
  );
}
