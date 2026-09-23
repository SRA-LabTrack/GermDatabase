import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export default function ProfileCardPrintMenu({
  open = false,
  triggerRef,
  variety = 'variety',
  busy = false,
  onCore,
  onComplete,
  onClose
}) {
  const menuRef = useRef(null);
  const [position, setPosition] = useState({
    top: 12,
    left: 12,
    width: 340
  });

  function updatePosition() {
    const trigger = triggerRef?.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const viewportWidth = Math.max(320, window.innerWidth || document.documentElement.clientWidth || 320);
    const viewportHeight = Math.max(320, window.innerHeight || document.documentElement.clientHeight || 320);

    const width = Math.min(340, viewportWidth - 24);
    const left = clamp(
      rect.right - width,
      12,
      Math.max(12, viewportWidth - width - 12)
    );

    const estimatedHeight = 154;
    const canOpenAbove = rect.top >= estimatedHeight + 18;
    const top = canOpenAbove
      ? Math.max(12, rect.top - estimatedHeight - 10)
      : Math.min(viewportHeight - estimatedHeight - 12, rect.bottom + 10);

    setPosition({ top, left, width });
  }

  useLayoutEffect(() => {
    if (!open) return undefined;

    updatePosition();

    function reposition() {
      updatePosition();
    }

    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);

    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, triggerRef]);

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event) {
      if (triggerRef?.current?.contains(event.target)) return;
      if (menuRef.current?.contains(event.target)) return;
      onClose?.();
    }

    function handleKeyDown(event) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose?.();
      triggerRef?.current?.focus?.();
    }

    document.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose, triggerRef]);

  if (!open) return null;

  return createPortal(
    <div
      ref={menuRef}
      className="profile-card-print-popover"
      role="menu"
      aria-label={`Print ${variety || 'variety'}`}
      style={{
        position: 'fixed',
        top: `${position.top}px`,
        left: `${position.left}px`,
        width: `${position.width}px`,
        zIndex: 2147483000
      }}
    >
      <button
        type="button"
        role="menuitem"
        disabled={Boolean(busy)}
        onClick={onCore}
      >
        <strong>Core Information</strong>
        <span>Preview core identity, parentage, yield, locations and disease reaction.</span>
      </button>

      <button
        type="button"
        role="menuitem"
        disabled={Boolean(busy)}
        onClick={onComplete}
      >
        <strong>Complete Information</strong>
        <span>Preview core information plus every recorded additional trait and germination field.</span>
      </button>
    </div>,
    document.body
  );
}
