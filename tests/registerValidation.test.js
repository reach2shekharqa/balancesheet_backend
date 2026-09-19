import test from 'node:test';
import assert from 'node:assert/strict';

import { validateRegistrationInput } from '../src/services/authService.js';

test('owner registration requires a company name but allows empty CIN or PAN', () => {
  const missingCompanyName = validateRegistrationInput({
    userName: 'Jane Doe',
    email: 'jane@example.com',
    password: 'password123',
    companyName: '',
    cin: '',
    pan: '',
    registrationIntent: 'owner',
  });

  assert.match(missingCompanyName, /Company name/i);

  const result = validateRegistrationInput({
    userName: 'Jane Doe',
    email: 'jane@example.com',
    password: 'password123',
    companyName: 'Example Ltd',
    cin: '',
    pan: '',
    registrationIntent: 'owner',
  });

  assert.equal(result, null);
});

test('owner registration no longer validates CIN and still validates bad PAN values', () => {
  const validWithoutCin = validateRegistrationInput({
    userName: 'Jane Doe',
    email: 'jane@example.com',
    password: 'password123',
    companyName: 'Example Ltd',
    cin: 'bad!',
    pan: '',
    registrationIntent: 'owner',
  });

  assert.equal(validWithoutCin, null);

  const invalidPan = validateRegistrationInput({
    userName: 'Jane Doe',
    email: 'jane@example.com',
    password: 'password123',
    companyName: 'Example Ltd',
    cin: 'U12345DL2020PTC123456',
    pan: 'bad!',
    registrationIntent: 'owner',
  });

  assert.match(invalidPan, /PAN/i);
});
