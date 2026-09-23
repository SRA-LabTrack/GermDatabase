import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Dna } from 'lucide-react';
import SugarcaneIcon from './SugarcaneIcon.jsx';

const INITIAL_VISIBLE = 20;
const PAGE_SIZE = 20;

function roleLabel(role) {
  return role === 'male' ? 'male parent' : 'female parent';
}

function reasonCopy(result) {
  if (result?.reason === 'missing-record') {
    return 'Select a registered variety with characterization data before CaneSprout can verify breeding suggestions.';
  }
  if (result?.reason === 'missing-year') {
    return `${result?.selectedVariety || 'This variety'} has no recorded collection year, so the required 5-year gap cannot be verified.`;
  }
  return 'No locally verifiable candidate currently meets both the 5-year gap and three-generation pedigree rules.';
}

export default function BreedingPartnerSuggestions({ result, onSelect }) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE);
  }, [result?.selectedKey, result?.selectedRole]);

  const suggestions = Array.isArray(result?.suggestions) ? result.suggestions : [];
  const visible = useMemo(
    () => suggestions.slice(0, visibleCount),
    [suggestions, visibleCount]
  );

  if (!result?.query) return null;

  const selectedRole = result?.selectedRole === 'female' ? 'female' : 'male';
  const counterpartRole = result?.counterpartRole === 'male' ? 'male' : 'female';
  const total = suggestions.length;
  const remaining = Math.max(0, total - visible.length);

  return (
    <section className="breeding-suggestion-panel" aria-label="Breeding partner suggestions">
      <div className="breeding-suggestion-heading">
        <div className="breeding-suggestion-title">
          <span className="breeding-suggestion-icon"><Dna size={19} /></span>
          <div>
            <small>Breeding suggestions</small>
            <strong>
              {result?.selectedVariety
                ? `Suggested ${counterpartRole} parents for ${result.selectedVariety}`
                : `Select a registered ${selectedRole} variety`}
            </strong>
            <span>
              The selected variety is being used as the <b>{selectedRole} parent</b>.
              Suggestions fill the opposite breeding role.
            </span>
          </div>
        </div>

        {result?.selectedYear ? (
          <div className="breeding-suggestion-anchor">
            <small>Selected year</small>
            <strong>{result.selectedYear}</strong>
          </div>
        ) : null}
      </div>

      <div className="breeding-suggestion-rules" aria-label="Breeding suggestion rules">
        <span><CheckCircle2 size={14} /> At least 5-year collection gap</span>
        <span><CheckCircle2 size={14} /> No shared recorded ancestor within 3 generations</span>
        <span><CheckCircle2 size={14} /> No recorded parent/child relation within 3 generations</span>
        <span><CheckCircle2 size={14} /> Suggested for the opposite breeding role</span>
      </div>

      {result?.reason || !total ? (
        <div className="breeding-suggestion-empty">
          <SugarcaneIcon size={24} />
          <div>
            <strong>No verified suggestions to show yet</strong>
            <span>{reasonCopy(result)}</span>
          </div>
        </div>
      ) : (
        <>
          <div className="breeding-suggestion-grid">
            {visible.map((candidate) => (
              <button
                key={`${candidate.key}:${candidate.variety}`}
                type="button"
                className="breeding-suggestion-card"
                onClick={() => onSelect?.(candidate.variety, counterpartRole)}
                title={`Use ${candidate.variety} as ${roleLabel(counterpartRole)}`}
              >
                <span className="breeding-suggestion-card-icon">
                  <SugarcaneIcon size={18} />
                </span>
                <span className="breeding-suggestion-card-main">
                  <strong>{candidate.variety}</strong>
                  <small>Use as {roleLabel(counterpartRole)}</small>
                </span>
                <span className="breeding-suggestion-card-metrics">
                  <b>{candidate.collectionYear}</b>
                  <em>{candidate.yearGap}-year gap</em>
                  <i>3-gen clear</i>
                </span>
              </button>
            ))}
          </div>

          <div className="breeding-suggestion-footer">
            <div>
              <strong>
                Showing {visible.length.toLocaleString()} of {total.toLocaleString()} eligible suggestions
              </strong>
              <span>
                Higher-confidence candidates with more recorded pedigree evidence are shown first.
              </span>
            </div>
            <div className="breeding-suggestion-footer-actions">
              {visibleCount > INITIAL_VISIBLE && (
                <button
                  type="button"
                  className="secondary-button compact"
                  onClick={() => setVisibleCount(INITIAL_VISIBLE)}
                >
                  Show first 20
                </button>
              )}
              {remaining > 0 && (
                <button
                  type="button"
                  className="secondary-button compact"
                  onClick={() => setVisibleCount((current) => current + PAGE_SIZE)}
                >
                  Show {Math.min(PAGE_SIZE, remaining)} more
                </button>
              )}
            </div>
          </div>
        </>
      )}

      <p className="breeding-suggestion-note">
        Screening uses the collection year and parentage currently recorded in CaneSprout.
        Missing or historically unrecorded ancestry cannot be inferred, so this is a registry
        pedigree screen rather than a genetic guarantee.
      </p>
    </section>
  );
}
