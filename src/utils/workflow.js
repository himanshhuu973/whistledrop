const STATUSES = ['SUBMITTED', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED'];

const ALLOWED = {
  SUBMITTED: ['UNDER_REVIEW'],
  UNDER_REVIEW: ['RESOLVED', 'DISMISSED'],
  RESOLVED: [],   // terminal
  DISMISSED: [],  // terminal
};

const canTransition = (from, to) => (ALLOWED[from] || []).includes(to);

module.exports = { STATUSES, ALLOWED, canTransition };
