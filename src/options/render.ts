/**
 * options/render.ts — the settings form's markup.
 *
 * Pure string builders, mirroring the dashboard's `ui/render` modules. Each
 * input carries `data-section`, `data-index` and `data-field` so one delegated
 * listener can route every edit back into the draft.
 *
 * The three tables differ only in which fields they show, so they are
 * described as data in {@link SECTIONS} and rendered by one generic function.
 * Adding a field to a rule is a one-line change here plus the matching field
 * on the draft row type.
 */

import type { DraftRow, DraftState, SectionName } from './draft';
import type { ValidationIssue } from '../config/schema';
import { escapeHtml } from '../ui/html';

export type { SectionName };

interface FieldSpec {
  /** Key on the draft row, and the `data-field` the input listener reads. */
  field: string;
  label: string;
  placeholder: string;
}

interface SectionSpec {
  fields: readonly FieldSpec[];
  /** Shown in place of rows when the table is empty. */
  empty: string;
}

const SECTIONS: Record<SectionName, SectionSpec> = {
  pinned: {
    empty: 'No pinned sites yet.',
    fields: [
      { field: 'url', label: 'URL', placeholder: 'https://mail.google.com' },
      { field: 'label', label: 'Label (optional)', placeholder: 'Gmail' },
    ],
  },
  disposable: {
    empty: 'No disposable rules — the Disposable card will stay empty.',
    fields: [
      { field: 'hostname', label: 'Hostname', placeholder: 'x.com or .zoom.us' },
      { field: 'pattern', label: 'Path pattern', placeholder: '/j/*, !#inbox/' },
    ],
  },
};

function renderField(
  section: SectionName,
  index: number,
  spec: FieldSpec,
  value: string,
): string {
  const id = `${section}-${index}-${spec.field}`;
  return `
    <div class="field">
      <label for="${escapeHtml(id)}">${escapeHtml(spec.label)}</label>
      <input id="${escapeHtml(id)}" type="text"
             data-section="${section}" data-index="${index}" data-field="${escapeHtml(spec.field)}"
             value="${escapeHtml(value)}" placeholder="${escapeHtml(spec.placeholder)}"
             spellcheck="false" autocomplete="off">
    </div>`;
}

/** Move-up / move-down / delete buttons for one row. */
function renderControls(section: SectionName, index: number, total: number): string {
  return `
    <div class="row-controls">
      <button class="icon-action" title="Move up" data-action="move-up"
              data-section="${section}" data-index="${index}" ${index === 0 ? 'disabled' : ''}>&uarr;</button>
      <button class="icon-action" title="Move down" data-action="move-down"
              data-section="${section}" data-index="${index}" ${index === total - 1 ? 'disabled' : ''}>&darr;</button>
      <button class="icon-action danger" title="Remove" data-action="remove"
              data-section="${section}" data-index="${index}">&times;</button>
    </div>`;
}

function renderRow(section: SectionName, row: DraftRow, index: number, total: number): string {
  const values = row as unknown as Record<string, string>;
  const fields = SECTIONS[section].fields
    .map((spec) => renderField(section, index, spec, values[spec.field] ?? ''))
    .join('');

  return `
    <div class="row row-${section}" data-section="${section}" data-index="${index}">
      ${fields}
      ${renderControls(section, index, total)}
    </div>`;
}

/** Renders one whole table. */
export function renderSection(section: SectionName, draft: DraftState): string {
  const rows: readonly DraftRow[] = draft[section];
  if (rows.length === 0) {
    return `<div class="row-empty">${escapeHtml(SECTIONS[section].empty)}</div>`;
  }
  return rows.map((row, i) => renderRow(section, row, i, rows.length)).join('');
}

/** Renders the validation panel, or `''` when everything is valid. */
export function renderIssues(issues: readonly ValidationIssue[]): string {
  if (issues.length === 0) return '';
  return `
    <strong>${escapeHtml(`${issues.length} entr${issues.length === 1 ? 'y was' : 'ies were'} adjusted or dropped:`)}</strong>
    <ul>
      ${issues
        .map((issue) => `<li>${escapeHtml(issue.path)} — ${escapeHtml(issue.message)}</li>`)
        .join('')}
    </ul>`;
}
