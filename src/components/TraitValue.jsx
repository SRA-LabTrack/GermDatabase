import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatLeafLengthCm, isColorTraitField, resolveRhsColors } from '../lib/traitVisuals.js';

function shown(value, fallback) {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function textTone(hex = '#ffffff') {
  const raw = String(hex).replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(raw)) return '#ffffff';
  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.57 ? '#183120' : '#ffffff';
}

function ColorPreviewDialog({ value, colors, onClose }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="trait-color-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="trait-color-dialog" role="dialog" aria-modal="true" aria-label={`Color preview for ${value}`} onMouseDown={(event) => event.stopPropagation()}>
        <header className="trait-color-dialog-header">
          <div>
            <small>Color visualization</small>
            <h3>{value}</h3>
          </div>
          <button type="button" className="trait-color-dialog-close" onClick={onClose} aria-label="Close color preview">×</button>
        </header>

        <div className={`trait-color-dialog-canvas ${colors.length > 1 ? 'is-multi' : ''}`}>
          {colors.map((color) => (
            <article
              key={`${color.code}-${color.hex}`}
              className="trait-color-dialog-panel"
              style={{ backgroundColor: color.hex, color: textTone(color.hex) }}
            >
              <div className="trait-color-dialog-code">
                <strong>{color.code}</strong>
                <span>{color.hex.toUpperCase()}</span>
              </div>
            </article>
          ))}
        </div>

        <div className="trait-color-dialog-details">
          {colors.map((color) => (
            <div key={`detail-${color.code}-${color.hex}`}>
              <span className="trait-color-dialog-dot" style={{ backgroundColor: color.hex }} aria-hidden="true" />
              <span>
                <strong>{color.code}</strong>
                <small>{color.hex.toUpperCase()} · {color.source}</small>
              </span>
            </div>
          ))}
        </div>

        <p className="trait-color-dialog-note">
          This is a digital screen approximation of the recorded RHS color code. Display calibration, brightness, and panel technology can change the apparent color.
        </p>
      </section>
    </div>,
    document.body
  );
}

function ColorValue({ value, fallback }) {
  const text = shown(value, fallback);
  const colors = resolveRhsColors(value);
  const [previewOpen, setPreviewOpen] = useState(false);

  if (!colors.length) return <strong>{text}</strong>;

  return (
    <div className="trait-color-value">
      <strong>{text}</strong>
      <button
        type="button"
        className="trait-color-preview"
        title={`Preview ${colors.map((color) => `${color.code} ${color.hex.toUpperCase()}`).join(' · ')}`}
        aria-label={`Open color preview for ${text}`}
        aria-haspopup="dialog"
        onClick={() => setPreviewOpen(true)}
      >
        <span className="trait-color-swatches" aria-hidden="true">
          {colors.map((color) => (
            <i key={`${color.code}-${color.hex}`} style={{ backgroundColor: color.hex }} />
          ))}
        </span>
        <span className="trait-color-preview-copy">
          <b>{colors.length === 1 ? colors[0].hex.toUpperCase() : `${colors.length} colors`}</b>
          <small>click to preview</small>
        </span>
      </button>
      {previewOpen && <ColorPreviewDialog value={text} colors={colors} onClose={() => setPreviewOpen(false)} />}
    </div>
  );
}

function LeafLengthValue({ value, fallback }) {
  const formatted = formatLeafLengthCm(value, fallback);
  if (!formatted.size) return <strong>{formatted.text}</strong>;

  return (
    <strong className="trait-length-value">
      <span>{formatted.measurement}</span>
      <em>({formatted.size})</em>
    </strong>
  );
}

export default function TraitValue({ fieldKey, value, fallback = 'Not provided' }) {
  if (fieldKey === 'leaf_length_cm') {
    return <LeafLengthValue value={value} fallback={fallback} />;
  }

  if (isColorTraitField(fieldKey)) {
    return <ColorValue value={value} fallback={fallback} />;
  }

  return <strong>{shown(value, fallback)}</strong>;
}
