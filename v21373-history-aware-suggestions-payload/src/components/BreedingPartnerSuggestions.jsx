import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Dna } from 'lucide-react';
import SugarcaneIcon from './SugarcaneIcon.jsx';

const INITIAL_VISIBLE = 20;
const PAGE_SIZE = 20;

function roleLabel(role) {
  return role === 'male' ? 'male parent' : 'female parent';
}

function historyLabel(candidate) {
  if (candidate?.neverCombined) return 'Never combined';
  if (candidate?.lastCrossLabel) return `Last: ${candidate.lastCrossLabel}`;
  return 'No recent cross';
}

function gapLabel(candidate) {
  if (candidate?.neverCombined) return 'New pairing';
  const years = Number(candidate?.yearsSinceCross || 0);
  return `${years}+ years ago`;
}

function pedigreeLabel(candidate) {
  return candidate?.pedigreeEvidence === 'recorded'
    ? '3-gen recorded clear'
    : 'No known 3-gen conflict';
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
              Suggested {counterpartRole} parents for {result?.selectedVariety || result?.query}
            </strong>
            <span>
              The selected variety is being used as the <b>{selectedRole} parent</b>.
              CaneSprout checks that same role pairing against recorded breeding history.
            </span>
          </div>
        </div>

        <div className="breeding-suggestion-anchor">
          <small>Eligible</small>
          <strong>{total.toLocaleString()}</strong>
        </div>
      </div>

      <div className="breeding-suggestion-rules" aria-label="Breeding suggestion rules">
        <span><CheckCircle2 size={14} /> Never crossed, or last same-role cross ≥ 5 years ago</span>
        <span><CheckCircle2 size={14} /> No known shared recorded ancestor within 3 generations</span>
        <span><CheckCircle2 size={14} /> No known recorded parent/child relation within 3 generations</span>
        <span><CheckCircle2 size={14} /> Suggested for the opposite breeding role</span>
      </div>

      {!total ? (
        <div className="breeding-suggestion-empty">
          <SugarcaneIcon size={24} />
          <div>
            <strong>No eligible suggestions found</strong>
            <span>
              Every locally recorded candidate is either too recently crossed in this role,
              has an undated prior cross that cannot satisfy the 5-year rule, or has a known
              pedigree conflict within three recorded generations.
            </span>
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
                  <b>{historyLabel(candidate)}</b>
                  <em>{gapLabel(candidate)}</em>
                  <i>{pedigreeLabel(candidate)}</i>
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
                Never-crossed pairings are prioritized, followed by older eligible pairings
                and candidates with more recorded pedigree evidence.
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
        The 5-year rule is based on recorded combination history for the selected role,
        not the variety&apos;s collection year. Pedigree screening excludes conflicts that
        CaneSprout can trace from recorded parentage through three generations; missing
        historical ancestry cannot be inferred.
      </p>
    </section>
  );
}
