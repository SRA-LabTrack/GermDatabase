import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, Dna, FileSpreadsheet, Menu, Plus, ShieldCheck } from 'lucide-react';
import { createPortal } from 'react-dom';

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export default function ToolbarToolsMenu({
  active = false,
  excelActive = false,
  formActive = false,
  combinationActive = false,
  adminActive = false,
  isAdmin = false,
  onExcelTools,
  onAddRecord,
  onCombinationRegistry,
  onAdminCenter
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({
    top: 0,
    left: 12,
    width: 340,
    maxHeight: 420
  });

  const anchorRef = useRef(null);
  const menuRef = useRef(null);

  function updatePosition() {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const viewportWidth = Math.max(320, window.innerWidth || document.documentElement.clientWidth || 320);
    const viewportHeight = Math.max(320, window.innerHeight || document.documentElement.clientHeight || 320);
    const width = Math.min(340, viewportWidth - 24);
    const left = clamp(rect.right - width, 12, Math.max(12, viewportWidth - width - 12));
    const top = Math.max(8, rect.bottom + 8);
    const maxHeight = Math.max(180, viewportHeight - top - 12);

    setPosition({ top, left, width, maxHeight });
  }

  useLayoutEffect(() => {
    if (!open) return undefined;
    updatePosition();

    const reposition = () => updatePosition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);

    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event) {
      if (anchorRef.current?.contains(event.target)) return;
      if (menuRef.current?.contains(event.target)) return;
      setOpen(false);
    }

    function handleKeyDown(event) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      anchorRef.current?.focus();
    }

    document.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  function run(action) {
    setOpen(false);
    window.requestAnimationFrame(() => action?.());
  }

  const portal = open ? createPortal(
    <div
      ref={menuRef}
      id="desktop-toolbar-tools-menu"
      className="toolbar-tools-menu toolbar-tools-menu-portal"
      role="menu"
      aria-label="Registry tools"
      style={{
        '--toolbar-tools-top': `${position.top}px`,
        '--toolbar-tools-left': `${position.left}px`,
        '--toolbar-tools-width': `${position.width}px`,
        '--toolbar-tools-max-height': `${position.maxHeight}px`
      }}
    >
      <button
        type="button"
        role="menuitem"
        className={excelActive ? 'active' : ''}
        onClick={() => run(onExcelTools)}
      >
        <FileSpreadsheet size={19} />
        <span>
          <strong>Excel Tools</strong>
          <small>Import, export, and edit spreadsheet data</small>
        </span>
      </button>

      <button
        type="button"
        role="menuitem"
        className={formActive ? 'active' : ''}
        onClick={() => run(onAddRecord)}
      >
        <Plus size={20} />
        <span>
          <strong>Add record</strong>
          <small>Register a new sugarcane variety</small>
        </span>
      </button>

      <button
        type="button"
        role="menuitem"
        className={combinationActive ? 'active' : ''}
        onClick={() => run(onCombinationRegistry)}
      >
        <Dna size={19} />
        <span>
          <strong>Combination Registry</strong>
          <small>Search and record male × female crosses</small>
        </span>
      </button>

      {isAdmin && (
        <button
          type="button"
          role="menuitem"
          className={adminActive ? 'active' : ''}
          onClick={() => run(onAdminCenter)}
        >
          <ShieldCheck size={19} />
          <span>
            <strong>Admin Center</strong>
            <small>Approvals, accounts, and administrator tools</small>
          </span>
        </button>
      )}
    </div>,
    document.body
  ) : null;

  return (
    <>
      <div
        ref={anchorRef}
        className={`toolbar-tools-drawer ${open || active ? 'active' : ''}`}
      >
        <button
          type="button"
          className="toolbar-tools-summary"
          aria-expanded={open}
          aria-haspopup="menu"
          aria-controls="desktop-toolbar-tools-menu"
          title="Open registry tools"
          onClick={() => setOpen((value) => !value)}
        >
          <Menu size={20} />
          <span>Tools</span>
          <ChevronDown className={`toolbar-tools-chevron ${open ? 'open' : ''}`} size={15} />
        </button>
      </div>
      {portal}
    </>
  );
}
