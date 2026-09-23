import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronDown,
  Dna,
  FileSpreadsheet,
  GitBranch,
  MapPin,
  Menu,
  Plus,
  ShieldCheck
} from 'lucide-react';
import SugarcaneIcon from './SugarcaneIcon.jsx';

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export default function DesktopPrimaryNav({
  germplasmActive = false,
  pedigreeActive = false,
  mapActive = false,
  toolsActive = false,
  excelActive = false,
  addRecordActive = false,
  combinationActive = false,
  adminActive = false,
  isAdmin = false,
  onGermplasm,
  onPedigree,
  onMap,
  onExcelTools,
  onAddRecord,
  onCombinationRegistry,
  onAdminCenter
}) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({
    top: 0,
    left: 12,
    width: 350,
    maxHeight: 420
  });

  const toolsButtonRef = useRef(null);
  const menuRef = useRef(null);

  function updateMenuPosition() {
    const button = toolsButtonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const viewportWidth = Math.max(320, window.innerWidth || document.documentElement.clientWidth || 320);
    const viewportHeight = Math.max(320, window.innerHeight || document.documentElement.clientHeight || 320);
    const width = Math.min(350, viewportWidth - 24);
    const left = clamp(rect.right - width, 12, Math.max(12, viewportWidth - width - 12));
    const top = Math.max(8, rect.bottom + 8);
    const maxHeight = Math.max(190, viewportHeight - top - 12);

    setMenuPosition({ top, left, width, maxHeight });
  }

  useLayoutEffect(() => {
    if (!toolsOpen) return undefined;
    updateMenuPosition();

    function reposition() {
      updateMenuPosition();
    }

    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);

    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [toolsOpen]);

  useEffect(() => {
    if (!toolsOpen) return undefined;

    function handlePointerDown(event) {
      if (toolsButtonRef.current?.contains(event.target)) return;
      if (menuRef.current?.contains(event.target)) return;
      setToolsOpen(false);
    }

    function handleKeyDown(event) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setToolsOpen(false);
      toolsButtonRef.current?.focus();
    }

    document.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [toolsOpen]);

  function run(action) {
    setToolsOpen(false);
    window.requestAnimationFrame(() => action?.());
  }

  const toolsMenu = toolsOpen ? createPortal(
    <div
      ref={menuRef}
      className="cs-tools-popover"
      role="menu"
      aria-label="Registry tools"
      style={{
        position: 'fixed',
        top: `${menuPosition.top}px`,
        left: `${menuPosition.left}px`,
        width: `${menuPosition.width}px`,
        maxHeight: `${menuPosition.maxHeight}px`,
        zIndex: 2147483000
      }}
    >
      <button
        type="button"
        role="menuitem"
        className={excelActive ? 'active' : ''}
        onClick={() => run(onExcelTools)}
      >
        <FileSpreadsheet size={20} />
        <span>
          <strong>Excel Tools</strong>
          <small>Import, export, and edit spreadsheet data</small>
        </span>
      </button>

      <button
        type="button"
        role="menuitem"
        className={addRecordActive ? 'active' : ''}
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
        <Dna size={20} />
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
          <ShieldCheck size={20} />
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
      <nav className="cs-primary-nav" aria-label="Primary registry navigation">
        <button
          type="button"
          className={`cs-primary-nav__item ${germplasmActive ? 'active' : ''}`}
          aria-current={germplasmActive ? 'page' : undefined}
          onClick={onGermplasm}
        >
          <SugarcaneIcon size={22} />
          <span>Germplasm</span>
        </button>

        <button
          type="button"
          className={`cs-primary-nav__item ${pedigreeActive ? 'active' : ''}`}
          aria-pressed={pedigreeActive}
          onClick={onPedigree}
        >
          <GitBranch size={22} />
          <span>Pedigree</span>
        </button>

        <button
          type="button"
          className={`cs-primary-nav__item ${mapActive ? 'active' : ''}`}
          aria-pressed={mapActive}
          onClick={onMap}
        >
          <MapPin size={22} />
          <span>Map</span>
        </button>

        <button
          ref={toolsButtonRef}
          type="button"
          className={`cs-primary-nav__item cs-primary-nav__tools ${toolsOpen || toolsActive ? 'active' : ''}`}
          aria-expanded={toolsOpen}
          aria-haspopup="menu"
          onClick={() => setToolsOpen((open) => !open)}
        >
          <Menu size={22} />
          <span>Tools</span>
          <ChevronDown className={toolsOpen ? 'open' : ''} size={15} />
        </button>
      </nav>
      {toolsMenu}
    </>
  );
}
