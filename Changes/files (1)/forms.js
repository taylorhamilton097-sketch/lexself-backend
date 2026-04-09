'use strict';

/**
 * Ontario Family Court Form Fill Engine
 * Fills Ontario court forms with user data from People in My Case + Profile
 * 
 * Strategy: Each form has FORMTEXT fields in a specific order.
 * We replace the blank <w:t>     </w:t> inside each FORMTEXT with user data.
 */

const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');
const { execSync } = require('child_process');
const { requireAuth } = require('../middleware/auth');

// Forms directory - store the .docx templates on the server
const FORMS_DIR = path.join(__dirname, '../../forms');

// Field maps - which FORMTEXT field index (1-based) gets which data
// Based on analysis of each form's XML structure
const FIELD_MAPS = {
  '8': { // Form 8 - Application (General)
    name: 'Form 8 — Application (General)',
    file: 'form8_application.docx',
    fields: {
      1:  'court_file_number',
      2:  'court_name',          // name of court
      3:  'applicant_name',      // Full legal name
      4:  'applicant_lawyer_name',
      5:  'applicant_address',
      6:  'applicant_lawyer_address',
      7:  'applicant_phone',
      8:  'applicant_lawyer_phone',
      9:  'applicant_email',
      10: 'applicant_lawyer_email',
      11: 'respondent_name',
      12: 'respondent_lawyer_name',
      13: 'respondent_address',
      14: 'respondent_lawyer_address',
      15: 'respondent_phone',
      16: 'respondent_lawyer_phone',
      17: 'respondent_email',
      18: 'respondent_lawyer_email',
      19: 'first_court_date',
    }
  },
  '10': { // Form 10 - Answer
    name: 'Form 10 — Answer',
    file: 'form10_answer.docx',
    fields: {
      1:  'court_file_number',
      3:  'applicant_name',
      4:  'applicant_lawyer_name',
      5:  'applicant_address',
      6:  'applicant_lawyer_address',
      7:  'applicant_phone',
      8:  'applicant_lawyer_phone',
      9:  'applicant_email',
      10: 'applicant_lawyer_email',
      11: 'respondent_name',
      12: 'respondent_lawyer_name',
      13: 'respondent_address',
      14: 'respondent_lawyer_address',
      15: 'respondent_phone',
      16: 'respondent_lawyer_phone',
      17: 'respondent_email',
      18: 'respondent_lawyer_email',
      20: 'deponent_name',
    }
  },
  '14': { // Form 14 - Notice of Motion
    name: 'Form 14 — Notice of Motion',
    file: 'form14_notice_of_motion.docx',
    fields: {
      1:  'court_file_number',
      3:  'moving_party_lawyer',
      5:  'responding_party_lawyer',
      7:  'motion_date',
      9:  'place_of_hearing',
      10: 'moving_party_name',
      14: 'orders_requested',
    }
  },
  '14a': { // Form 14A - Affidavit (General)
    name: 'Form 14A — Affidavit (General)',
    file: 'form14a_affidavit.docx',
    fields: {
      1:  'court_file_number',
      2:  'affidavit_date',
      3:  'court_office_address',
      4:  'applicant_lawyer',
      6:  'respondent_lawyer',
      8:  'deponent_name',
      9:  'deponent_municipality',
      10: 'affidavit_content',
    }
  },
  '14c': { // Form 14C - Confirmation
    name: 'Form 14C — Confirmation',
    file: 'form14c_confirmation.docx',
    fields: {
      1:  'court_file_number',
      3:  'applicant_lawyer',
      5:  'respondent_lawyer',
      8:  'moving_party_name',
      12: 'motion_date',
    }
  },
  '25': { // Form 25 - Draft Order
    name: 'Form 25 — Draft Order',
    file: 'form25_draft_order.docx',
    fields: {
      2:  'court_file_number',
      5:  'judge_name',
      7:  'respondent_name',
      8:  'order_date',
      10: 'parties_names',
    }
  },
  '6b': { // Form 6B - Affidavit of Service
    name: 'Form 6B — Affidavit of Service',
    file: 'form6b_affidavit_of_service.docx',
    fields: {
      2:  'court_file_number',
      4:  'court_office_address',
      5:  'applicant_lawyer',
      7:  'respondent_lawyer',
      9:  'deponent_name',
      10: 'deponent_municipality',
      11: 'service_date',
      12: 'service_time',
      13: 'person_served',
    }
  },
  '35_1': { // Form 35.1 - Parenting Affidavit
    name: 'Form 35.1 — Parenting Affidavit',
    file: 'form35_1_parenting.docx',
    fields: {
      1:  'court_file_number',
      3:  'applicant_lawyer',
      5:  'respondent_lawyer',
      7:  'deponent_name',
      8:  'deponent_municipality',
    }
  },
};

// Build data object from profile + people data
function buildFormData(profile, people = []) {
  // Find parties from people directory
  const applicant = people.find(p => p.role === 'Applicant') || {};
  const respondent = people.find(p => p.role === 'Respondent') || {};
  const children = people.filter(p => p.role === 'Child');

  // Build formatted addresses
  const applicantAddr = [applicant.address, applicant.city].filter(Boolean).join(', ');
  const respondentAddr = [respondent.address, respondent.city].filter(Boolean).join(', ');

  return {
    court_file_number:        profile.cf_number || '',
    court_name:               profile.cf_court || '',
    court_office_address:     profile.cf_addr || '',
    
    applicant_name:           applicant.name || profile.p_first ? `${profile.p_first || ''} ${profile.p_last || ''}`.trim() : '',
    applicant_address:        applicantAddr || profile.p_addr || '',
    applicant_phone:          applicant.phone || profile.p_phone || '',
    applicant_email:          applicant.email || profile.p_email || '',
    applicant_lawyer:         '',
    applicant_lawyer_name:    '',
    applicant_lawyer_address: '',
    applicant_lawyer_phone:   '',
    applicant_lawyer_email:   '',

    respondent_name:           respondent.name || '',
    respondent_address:        respondentAddr || '',
    respondent_phone:          respondent.phone || '',
    respondent_email:          respondent.email || '',
    respondent_lawyer:         '',
    respondent_lawyer_name:    '',
    respondent_lawyer_address: '',
    respondent_lawyer_phone:   '',
    respondent_lawyer_email:   '',

    deponent_name:             applicant.name || `${profile.p_first || ''} ${profile.p_last || ''}`.trim(),
    deponent_municipality:     profile.p_city || '',

    moving_party_name:         applicant.name || `${profile.p_first || ''} ${profile.p_last || ''}`.trim(),
    moving_party_lawyer:       '',
    responding_party_lawyer:   '',

    first_court_date:          profile.cf_nextdate || '',
    motion_date:               profile.cf_nextdate || '',
    affidavit_date:            new Date().toLocaleDateString('en-CA'),
    order_date:                '',
    service_date:              '',
    service_time:              '',
    person_served:             '',

    orders_requested:          '',
    affidavit_content:         '',
    judge_name:                '',
    parties_names:             [applicant.name, respondent.name].filter(Boolean).join(' and '),
    place_of_hearing:          profile.cf_court || '',
  };
}

// Fill a form by replacing FORMTEXT field values
function fillForm(formKey, data) {
  const map = FIELD_MAPS[formKey];
  if (!map) throw new Error(`Unknown form: ${formKey}`);

  const templatePath = path.join(FORMS_DIR, map.file);
  if (!fs.existsSync(templatePath)) throw new Error(`Template not found: ${map.file}`);

  // Read the docx (it's a zip)
  const AdmZip = require('adm-zip');
  const zip = new AdmZip(templatePath);
  let docXml = zip.readAsText('word/document.xml');

  // Find all FORMTEXT instances and replace in order
  let fieldIndex = 0;
  docXml = docXml.replace(
    /(<w:instrText[^>]*> FORMTEXT <\/w:instrText><w:fldChar w:fldCharType="separate"\/>)<w:t>([^<]*)<\/w:t>(<w:fldChar w:fldCharType="end"\/>)/g,
    (match, pre, oldVal, post) => {
      fieldIndex++;
      const dataKey = map.fields[fieldIndex];
      const newVal = dataKey && data[dataKey] !== undefined ? escapeXml(data[dataKey]) : oldVal;
      return `${pre}<w:t>${newVal}</w:t>${post}`;
    }
  );

  // Write back and return buffer
  zip.updateFile('word/document.xml', Buffer.from(docXml, 'utf8'));
  return zip.toBuffer();
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// GET /api/forms/list
router.get('/list', requireAuth, (req, res) => {
  const available = Object.entries(FIELD_MAPS).map(([key, val]) => ({
    key,
    name: val.name,
    available: fs.existsSync(path.join(FORMS_DIR, val.file)),
  }));
  res.json({ forms: available });
});

// POST /api/forms/fill
// Body: { formKey, profile, people, extraData }
router.post('/fill', requireAuth, (req, res) => {
  const { formKey, profile = {}, people = [], extraData = {} } = req.body;

  try {
    const formData = { ...buildFormData(profile, people), ...extraData };
    const buffer = fillForm(formKey, formData);
    const map = FIELD_MAPS[formKey];

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${map.name.replace(/[^a-zA-Z0-9]/g, '_')}.docx"`);
    res.send(buffer);
  } catch(err) {
    console.error('Form fill error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
