/**
 * options/render.ts — the settings form's markup.
 *
 * Pure string builders, mirroring the dashboard's `ui/render` modules. Each
 * input carries `data-section`, `data-index` and `data-field` so one delegated
 * listener can route every edit back into the draft.
 */

import type { CustomRow, DraftState, LandingRow, PinnedRow, SectionName } from './draft';
import type { ValidationIssue } from '../config/schema';
import { attr, escapeHtml } from '../ui/html';

export type { SectionName };

interface FieldSpec {
  field: string;
  label: string;
  value: string;
  placeholder: string;
}

function renderField(section: SectionName, index: number, spec: FieldSpec): string {
  const id = `${section}-${index}-${spec.field}`;
  return `
    <div class="field">
      <label for="${attr(id)}">${escapeHtml(spec.label)}</label>
      <input id="${attr(id)}" type="text"
             data-section="${section}" data-index="${index}" data-field="${attr(spec.field)}"
             value="${attr(spec.value)}" placeholder="${attr(spec.placeholder)}"
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

export function renderPinnedRow(row: PinnedRow, index: number, total: number): string {
  return `
    <div class="row row-pinned" data-section="pinned" data-index="${index}">
      ${renderField('pinned', index, {
        field: 'url',
        label: 'URL',
        value: row.url,
        placeholder: 'https://mail.google.com',
      })}
      ${renderField('pinned', index, {
        field: 'label',
        label: 'Label (optional)',
        value: row.label,
        placeholder: 'Gmail',
      })}
      ${renderControls('pinned', index, total)}
    </div>`;
}

export function renderLandingRow(row: LandingRow, index: number, total: number): string {
  return `
    <div class="row row-landing" data-section="landing" data-index="${index}">
      ${renderField('landing', index, {
        field: 'hostname',
        label: 'Hostname',
        value: row.hostname,
        placeholder: 'x.com or .atlassian.net',
      })}
      ${renderField('landing', index, {
        field: 'pathPrefix',
        label: 'Path starts with',
        value: row.pathPrefix,
        placeholder: '/',
      })}
      ${renderField('landing', index, {
        field: 'pathExact',
        label: 'Exact paths',
        value: row.pathExact,
        placeholder: '/home, /feed',
      })}
      ${renderField('landing', index, {
        field: 'urlNotContains',
        label: 'Except URLs containing',
        value: row.urlNotContains,
        placeholder: '#inbox/, #sent/',
      })}
      ${renderControls('landing', index, total)}
    </div>`;
}

export function renderCustomRow(row: CustomRow, index: number, total: number): string {
  return `
    <div class="row row-custom" data-section="custom" data-index="${index}">
      ${renderField('custom', index, {
        field: 'groupKey',
        label: 'Group key',
        value: row.groupKey,
        placeholder: 'work-jira',
      })}
      ${renderField('custom', index, {
        field: 'groupLabel',
        label: 'Card title',
        value: row.groupLabel,
        placeholder: 'Jira',
      })}
      ${renderField('custom', index, {
        field: 'hostname',
        label: 'Hostname',
        value: row.hostname,
        placeholder: '.atlassian.net',
      })}
      ${renderField('custom', index, {
        field: 'pathPrefix',
        label: 'Path starts with',
        value: row.pathPrefix,
        placeholder: '/jira',
      })}
      ${renderControls('custom', index, total)}
    </div>`;
}

/** Shown in place of rows when a table is empty. */
function renderEmpty(message: string): string {
  return `<div class="row-empty">${escapeHtml(message)}</div>`;
}

/** Renders one whole table. */
export function renderSection(section: SectionName, draft: DraftState): string {
  switch (section) {
    case 'pinned':
      return draft.pinned.length === 0
        ? renderEmpty('No pinned sites yet.')
        : draft.pinned.map((row, i) => renderPinnedRow(row, i, draft.pinned.length)).join('');
    case 'landing':
      return draft.landing.length === 0
        ? renderEmpty('No homepage rules — the Homepages card will stay empty.')
        : draft.landing.map((row, i) => renderLandingRow(row, i, draft.landing.length)).join('');
    case 'custom':
      return draft.custom.length === 0
        ? renderEmpty('No custom groups — tabs group by hostname.')
        : draft.custom.map((row, i) => renderCustomRow(row, i, draft.custom.length)).join('');
  }
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
