'use strict';

/**
 * Ontario Family Court Form Generator
 *
 * Uses the `docx` npm library to generate filled-in court forms as .docx files.
 * All form templates live in ./templates/ and export a single `build(data)` function
 * that returns a docx Document instance.
 *
 * Consumers: server/routes/forms.js
 */

const { Packer } = require('docx');

const generators = {
  '14a': require('./templates/14a'),
  '8a':  require('./templates/8a'),
};

/**
 * Build a filled docx buffer for the given form.
 * @param {string} formId - '14a' | '8a'
 * @param {object} data   - Form data (profile, children, parties, case info, form-specific fields)
 * @returns {Promise<Buffer>}
 */
async function generateForm(formId, data) {
  const template = generators[formId];
  if (!template) throw new Error(`Unknown form: ${formId}`);
  const doc = template.build(data);
  return await Packer.toBuffer(doc);
}

function listForms() {
  return Object.keys(generators);
}

module.exports = { generateForm, listForms };
