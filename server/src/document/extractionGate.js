const ApiError = require('../utils/ApiError');
const { maxConcurrentExtractions } = require('./limits');

// Caps how many document extractions run at the same time in this process (MAX_CONCURRENT_EXTRACTIONS).
//
// It is deliberately NOT a queue. A queued request would keep its whole uploaded file in memory while it
// waits, which is exactly the resource pressure this gate exists to prevent. When every slot is busy the
// request is refused at once with a clean 503 + Retry-After and the caller can simply try again.
//
// A slot is held only for the extraction itself (archive inspection + text extraction), never for the
// storage write or the database insert.

let active = 0;

function busy() {
  const err = new ApiError(
    503,
    'The server is busy processing other documents. Please try again in a few seconds.',
    null,
    'EXTRACTION_BUSY'
  );
  err.retryAfterSeconds = 5;
  return err;
}

// Takes a slot or throws the 503. Returns a release function that is safe to call more than once.
function acquireExtractionSlot() {
  if (active >= maxConcurrentExtractions()) throw busy();
  active += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    active -= 1;
  };
}

// Runs fn while holding a slot; the slot is released on success, on any thrown error, and on rejection.
async function withExtractionSlot(fn) {
  const release = acquireExtractionSlot();
  try {
    return await fn();
  } finally {
    release();
  }
}

const activeExtractions = () => active;

module.exports = { acquireExtractionSlot, withExtractionSlot, activeExtractions };
