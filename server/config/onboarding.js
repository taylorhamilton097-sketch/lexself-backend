'use strict';

/**
 * Onboarding step definitions — Session 6a
 *
 * Each step has:
 *   id              — stable string identifier (persisted in user_onboarding_state.completed)
 *   title           — short label shown in the checklist
 *   description     — one-sentence explanation shown when the step is expanded
 *   ctaLabel        — text on the action button
 *   ctaAction       — string key the client interprets to trigger navigation/UI.
 *                     The server never uses this; it's purely a client-side hint.
 *   completionSignal — { type, ... } descriptor that the server evaluates against
 *                      existing tables to decide whether the user has already done this.
 *                      Keeps completion state derivable without new flags per step.
 *
 * Supported completionSignal types:
 *   has_usage_row    — { type: 'has_usage_row', product, usageType }
 *                      row exists in `usage` where user_id, product, type match
 *   has_case_parties — { type: 'has_case_parties', product, minCount }
 *                      at least minCount rows in case_parties for this user+product
 *   has_charges      — { type: 'has_charges', minCount }
 *                      criminal-only: at least minCount rows in criminal_charges
 *   profile_has      — { type: 'profile_has', table, fields }
 *                      at least one of `fields` is non-empty in the single-row table
 *                      (e.g. user_profiles, family_case_info, criminal_case_info)
 *
 * Kept deliberately small — 4 steps per product. Expansion is cheap; resist it.
 */

const criminalSteps = [
  {
    id: 'case_context',
    title: 'Add your charge',
    description:
      'Tell us what you\'ve been charged with so ClearStand can tailor every analysis, chat answer, and document to your case.',
    ctaLabel: 'Open case profile',
    ctaAction: 'open-case-profile',
    completionSignal: { type: 'has_charges', minCount: 1 },
  },
  {
    id: 'upload_disclosure',
    title: 'Upload Crown disclosure',
    description:
      'Drop a Crown brief, ITO, officer notes, or will-says into the analyzer. Processed in memory, never stored on the server.',
    ctaLabel: 'Go to upload',
    ctaAction: 'open-upload',
    completionSignal: { type: 'has_usage_row', product: 'criminal', usageType: 'analysis' },
  },
  {
    id: 'first_analysis',
    title: 'Run your first analysis',
    description:
      'The five-pass analysis extracts timelines, identifies Charter issues, and flags weaknesses in the Crown\'s case.',
    ctaLabel: 'Open upload',
    ctaAction: 'open-upload',
    completionSignal: { type: 'has_usage_row', product: 'criminal', usageType: 'analysis' },
  },
  {
    id: 'first_chat',
    title: 'Ask a follow-up question',
    description:
      'Chat about the analysis, sentencing ranges, procedure, or anything specific to your charge. Your case context travels with every question.',
    ctaLabel: 'Open chat',
    ctaAction: 'open-chat',
    completionSignal: { type: 'has_usage_row', product: 'criminal', usageType: 'chat' },
  },
];

const familySteps = [
  {
    id: 'case_profile',
    title: 'Complete your case profile',
    description:
      'Your name, court file, and role auto-fill into every form and affidavit. Do this once; save hours later.',
    ctaLabel: 'Open profile',
    ctaAction: 'open-profile',
    completionSignal: {
      type: 'profile_has',
      table: 'user_profiles',
      fields: ['first', 'last'],
    },
  },
  {
    id: 'other_party',
    title: 'Add the other party',
    description:
      'Applicant, respondent, lawyer — adding parties now means forms and affidavits populate correctly on the first try.',
    ctaLabel: 'Add a party',
    ctaAction: 'open-profile',
    completionSignal: { type: 'has_case_parties', product: 'family', minCount: 1 },
  },
  {
    id: 'first_document',
    title: 'Generate your first document',
    description:
      'Pick any Form 8, 10, 14, or affidavit from the sidebar. ClearStand builds the draft; you review and refine.',
    ctaLabel: 'Browse forms',
    ctaAction: 'scroll-to-forms',
    completionSignal: { type: 'has_usage_row', product: 'family', usageType: 'analysis' },
  },
  {
    id: 'first_chat',
    title: 'Ask the AI about your case',
    description:
      'Custody, support, property division, procedure — chat understands Ontario family law and remembers your profile.',
    ctaLabel: 'Open chat',
    ctaAction: 'open-chat',
    completionSignal: { type: 'has_usage_row', product: 'family', usageType: 'chat' },
  },
];

function getStepsForProduct(product) {
  if (product === 'family') return familySteps;
  return criminalSteps; // default to criminal
}

module.exports = {
  criminalSteps,
  familySteps,
  getStepsForProduct,
};
