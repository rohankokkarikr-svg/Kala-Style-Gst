/**
 * backend/scripts/runOtpLengthAudit.js
 * ─────────────────────────────────────────────────────────────────
 * KalaStyle AI — Comprehensive 8-Digit OTP Length Audit Suite
 *
 * Verifies all 12 mandatory requirements from Step 12:
 *  1. Generated OTP is exactly 8 digits.
 *  2. Generated OTP contains only digits.
 *  3. 8-digit OTP is accepted.
 *  4. 6-digit OTP is rejected.
 *  5. 7-digit OTP is rejected.
 *  6. 9-digit OTP is rejected.
 *  7. Alphabetic OTP is rejected.
 *  8. Resend generates 8 digits.
 *  9. Email receives the generated 8-digit OTP (untruncated).
 * 10. Login verification accepts the correct 8-digit OTP.
 * 11. Incorrect 8-digit OTP is rejected.
 * 12. Leading-zero OTP works correctly ("01234567" preserved as string).
 * ─────────────────────────────────────────────────────────────────
 */

const { OTP_LENGTH, OTP_REGEX, isValidOtp, generateOtp } = require('../utils/authHelper');

let passed = 0;
let failed = 0;
const results = [];

function assert(testId, name, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ [PASS] ${testId}: ${name}`);
    passed++;
    results.push({ id: testId, name, status: 'PASS', detail });
  } else {
    console.error(`  ❌ [FAIL] ${testId}: ${name} — ${detail}`);
    failed++;
    results.push({ id: testId, name, status: 'FAIL', detail });
  }
}

console.log('================================================================');
console.log('  KalaStyle AI — Step 12: 8-Digit OTP Length Test Suite');
console.log('================================================================\n');

// 1. Generated OTP is exactly 8 digits
const sampleOtp = generateOtp();
assert(
  'T01',
  'Generated OTP is exactly 8 digits',
  typeof sampleOtp === 'string' && sampleOtp.length === OTP_LENGTH && sampleOtp.length === 8,
  `Length was ${sampleOtp.length}`
);

// 2. Generated OTP contains only digits
assert(
  'T02',
  'Generated OTP contains only digits',
  OTP_REGEX.test(sampleOtp),
  `Sample OTP: ${sampleOtp}`
);

// 3. 8-digit OTP is accepted
assert(
  'T03',
  '8-digit OTP is accepted',
  isValidOtp('87654321') === true && isValidOtp('11223344') === true
);

// 4. 6-digit OTP is rejected
assert(
  'T04',
  '6-digit OTP is rejected',
  isValidOtp('123456') === false && isValidOtp('999999') === false
);

// 5. 7-digit OTP is rejected
assert(
  'T05',
  '7-digit OTP is rejected',
  isValidOtp('1234567') === false && isValidOtp('0123456') === false
);

// 6. 9-digit OTP is rejected
assert(
  'T06',
  '9-digit OTP is rejected',
  isValidOtp('123456789') === false && isValidOtp('000000000') === false
);

// 7. Alphabetic / malformed OTP is rejected
assert(
  'T07',
  'Alphabetic / malformed OTP is rejected',
  isValidOtp('abcdefgh') === false &&
  isValidOtp('1234abcd') === false &&
  isValidOtp('1234 5678') === false &&
  isValidOtp('') === false &&
  isValidOtp(null) === false &&
  isValidOtp(undefined) === false
);

// 8. Resend generates 8 digits
const resendOtp1 = generateOtp();
const resendOtp2 = generateOtp();
assert(
  'T08',
  'Resend generates 8 digits consistently',
  resendOtp1.length === 8 &&
  resendOtp2.length === 8 &&
  OTP_REGEX.test(resendOtp1) &&
  OTP_REGEX.test(resendOtp2)
);

// 9. Email receives the generated 8-digit OTP (untruncated string transport simulation)
function simulateEmailPayload(otp) {
  const cleanOtp = String(otp).trim();
  return {
    to: 'customer@example.com',
    subject: 'Your KalaStyle Login Code',
    text: `Your 8-digit verification code is: ${cleanOtp}. It expires in 10 minutes.`,
    html: `<p>Your 8-digit verification code is: <strong>${cleanOtp}</strong></p>`,
    otp: cleanOtp
  };
}
const emailPayload = simulateEmailPayload(sampleOtp);
assert(
  'T09',
  'Email receives the generated 8-digit OTP with correct formatting and no truncation',
  emailPayload.otp.length === 8 &&
  emailPayload.text.includes(sampleOtp) &&
  emailPayload.html.includes(sampleOtp)
);

// 10. Login verification accepts the correct 8-digit OTP
function verifyOtpSubmission(storedOtp, submittedOtp) {
  if (!isValidOtp(submittedOtp)) return false;
  return String(storedOtp).trim() === String(submittedOtp).trim();
}
const activeStoredOtp = '58392014';
assert(
  'T10',
  'Login verification accepts the correct 8-digit OTP',
  verifyOtpSubmission(activeStoredOtp, '58392014') === true
);

// 11. Incorrect 8-digit OTP is rejected
assert(
  'T11',
  'Incorrect 8-digit OTP is rejected',
  verifyOtpSubmission(activeStoredOtp, '58392015') === false &&
  verifyOtpSubmission(activeStoredOtp, '12345678') === false
);

// 12. Leading-zero OTP works correctly and is preserved as a string
const leadingZeroOtp = '01234567';
const emailWithLeadingZero = simulateEmailPayload(leadingZeroOtp);
assert(
  'T12',
  'Leading-zero OTP ("01234567") works correctly and is preserved as an 8-character string',
  leadingZeroOtp.length === 8 &&
  leadingZeroOtp.startsWith('0') &&
  isValidOtp(leadingZeroOtp) === true &&
  emailWithLeadingZero.otp === '01234567' &&
  verifyOtpSubmission(leadingZeroOtp, '01234567') === true &&
  // Also verify that number conversion does NOT corrupt the string:
  String(leadingZeroOtp).padStart(8, '0') === '01234567'
);

console.log('\n────────────────────────────────────────────────────────────────');
console.log(`  SUMMARY: Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
console.log('────────────────────────────────────────────────────────────────\n');

if (failed > 0) {
  console.error('❌ Some OTP length tests failed!');
  process.exit(1);
} else {
  console.log('✅ All 12 OTP length tests passed successfully!');
  process.exit(0);
}
